"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/lib/supabase/server";
import { sendSupportNotification } from "@/server/support-notification";

const maxAttachmentSize = 5 * 1024 * 1024;
const attachmentExtensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const supportTicketInput = z.object({
  organizationId: z.uuid(),
  category: z.enum(["INTERFACE", "TELEGRAM", "DATA", "QUESTION", "IDEA", "OTHER"]),
  priority: z.enum(["NORMAL", "HIGH", "BLOCKER"]),
  subject: z.string().trim().min(5).max(120),
  description: z.string().trim().min(15).max(4000),
  stepsToReproduce: z.string().trim().max(2000),
  contact: z.string().trim().max(160),
  pageUrl: z.string().trim().max(1000),
  userAgent: z.string().trim().max(1000),
  deviceTimezone: z.string().trim().max(100),
  technicalContext: z.string().trim().max(5000),
});

const categoryLabels = {
  INTERFACE: "Интерфейс Mini App",
  TELEGRAM: "Telegram-бот",
  DATA: "Данные или расчёты",
  QUESTION: "Вопрос по работе",
  IDEA: "Предложение",
  OTHER: "Другое",
} as const;

const priorityLabels = {
  NORMAL: "Обычная",
  HIGH: "Мешает работе",
  BLOCKER: "Работа остановлена",
} as const;

export type SupportFormState = {
  success: boolean;
  message: string;
  ticketReference?: string;
  submissionId?: string;
};

export async function createSupportTicket(
  _previousState: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  const parsed = supportTicketInput.safeParse({
    organizationId: formData.get("organization_id"),
    category: formData.get("category"),
    priority: formData.get("priority"),
    subject: formData.get("subject"),
    description: formData.get("description"),
    stepsToReproduce: formData.get("steps_to_reproduce") ?? "",
    contact: formData.get("contact") ?? "",
    pageUrl: formData.get("page_url") ?? "",
    userAgent: formData.get("user_agent") ?? "",
    deviceTimezone: formData.get("device_timezone") ?? "",
    technicalContext: formData.get("technical_context") ?? "{}",
  });
  if (!parsed.success) {
    return { success: false, message: "Проверьте тему и описание ошибки. В описании нужно не менее 15 символов." };
  }

  let technicalContext: Record<string, unknown> = {};
  try {
    const value = JSON.parse(parsed.data.technicalContext || "{}");
    if (value && typeof value === "object" && !Array.isArray(value)) technicalContext = value as Record<string, unknown>;
  } catch {
    technicalContext = {};
  }

  const attachment = formData.get("attachment");
  const file = attachment instanceof File && attachment.size > 0 ? attachment : null;
  if (file && (!attachmentExtensions[file.type] || file.size > maxAttachmentSize)) {
    return { success: false, message: "Можно приложить JPG, PNG или WEBP размером до 5 МБ." };
  }

  const supabase = await createClient();
  const { data: claimsResult, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsResult?.claims?.sub;
  if (claimsError || !userId) return { success: false, message: "Сессия истекла. Войдите в кабинет ещё раз." };

  const { data: membership, error: membershipError } = await supabase
    .from("organization_memberships")
    .select("organization_id, organizations(name), profiles(display_name)")
    .eq("organization_id", parsed.data.organizationId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  if (membershipError || !membership) return { success: false, message: "Не удалось подтвердить доступ к компании." };

  const ticketId = crypto.randomUUID();
  let attachmentPath: string | null = null;
  if (file) {
    attachmentPath = `${parsed.data.organizationId}/${userId}/${ticketId}.${attachmentExtensions[file.type]}`;
    const { error: uploadError } = await supabase.storage
      .from("support-attachments")
      .upload(attachmentPath, file, { contentType: file.type, upsert: false });
    if (uploadError) return { success: false, message: "Не удалось загрузить скриншот. Попробуйте уменьшить файл или отправить обращение без него." };
  }

  const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "local";
  const { data: ticket, error: ticketError } = await supabase
    .from("support_tickets")
    .insert({
      id: ticketId,
      organization_id: parsed.data.organizationId,
      created_by: userId,
      category: parsed.data.category,
      priority: parsed.data.priority,
      subject: parsed.data.subject,
      description: parsed.data.description,
      steps_to_reproduce: parsed.data.stepsToReproduce || null,
      contact: parsed.data.contact || null,
      page_url: parsed.data.pageUrl || null,
      user_agent: parsed.data.userAgent || null,
      device_timezone: parsed.data.deviceTimezone || null,
      app_version: appVersion,
      technical_context: technicalContext,
      attachment_bucket: attachmentPath ? "support-attachments" : null,
      attachment_path: attachmentPath,
      attachment_filename: file?.name ?? null,
      attachment_content_type: file?.type ?? null,
      attachment_size_bytes: file?.size ?? null,
    })
    .select("ticket_number")
    .single();

  if (ticketError || !ticket) {
    if (attachmentPath) await supabase.storage.from("support-attachments").remove([attachmentPath]);
    return { success: false, message: "Не удалось зарегистрировать обращение. Попробуйте ещё раз." };
  }

  const ticketReference = `TP-${String(ticket.ticket_number).padStart(6, "0")}`;
  const organization = Array.isArray(membership.organizations) ? membership.organizations[0] : membership.organizations;
  const profile = Array.isArray(membership.profiles) ? membership.profiles[0] : membership.profiles;
  const reporterEmail = typeof claimsResult.claims.email === "string" ? claimsResult.claims.email : null;
  await sendSupportNotification({
    ticketReference,
    organizationName: organization?.name ?? "Компания",
    reporterName: profile?.display_name || reporterEmail || "Пользователь",
    reporterEmail,
    categoryLabel: categoryLabels[parsed.data.category],
    priorityLabel: priorityLabels[parsed.data.priority],
    subject: parsed.data.subject,
    description: parsed.data.description,
    contact: parsed.data.contact || null,
    pageUrl: parsed.data.pageUrl || null,
  });

  revalidatePath("/dashboard/support");
  return {
    success: true,
    message: `Обращение ${ticketReference} зарегистрировано. Мы сохранили техническую информацию вместе с описанием.`,
    ticketReference,
    submissionId: ticketId,
  };
}
