"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";

import { createSupportTicket, type SupportFormState } from "@/app/actions/support";

const initialState: SupportFormState = { success: false, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return <button type="submit" disabled={pending}>{pending ? "Отправляем…" : "Отправить в поддержку"}</button>;
}

function captureDiagnostics(form: HTMLFormElement | null) {
  if (!form) return;
  const telegram = (window as Window & {
    Telegram?: { WebApp?: { platform?: string; version?: string; colorScheme?: string } };
  }).Telegram?.WebApp;
  const setValue = (name: string, value: string) => {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = value;
  };
  setValue("page_url", window.location.href);
  setValue("user_agent", navigator.userAgent);
  setValue("device_timezone", Intl.DateTimeFormat().resolvedOptions().timeZone || "");
  setValue("technical_context", JSON.stringify({
    screen: `${window.screen.width}x${window.screen.height}`,
    viewport: `${window.innerWidth}x${window.innerHeight}`,
    language: navigator.language,
    online: navigator.onLine,
    telegramPlatform: telegram?.platform ?? null,
    telegramVersion: telegram?.version ?? null,
    telegramColorScheme: telegram?.colorScheme ?? null,
  }));
}

export function SupportForm({ organizationId }: { organizationId: string }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action] = useActionState(createSupportTicket, initialState);

  useEffect(() => {
    captureDiagnostics(formRef.current);
  }, []);

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset();
      captureDiagnostics(formRef.current);
    }
  }, [state.submissionId, state.success]);

  return <form ref={formRef} action={action} className="support-form stack-form">
    <input type="hidden" name="organization_id" value={organizationId} />
    <input type="hidden" name="page_url" defaultValue="" />
    <input type="hidden" name="user_agent" defaultValue="" />
    <input type="hidden" name="device_timezone" defaultValue="" />
    <input type="hidden" name="technical_context" defaultValue="{}" />

    <div className="support-form-grid">
      <label><span>Что произошло</span><select name="category" defaultValue="INTERFACE" required>
        <option value="INTERFACE">Ошибка в Mini App</option>
        <option value="TELEGRAM">Ошибка Telegram-бота</option>
        <option value="DATA">Неверные данные или расчёты</option>
        <option value="QUESTION">Вопрос по работе</option>
        <option value="IDEA">Предложение по улучшению</option>
        <option value="OTHER">Другое</option>
      </select></label>
      <label><span>Насколько мешает</span><select name="priority" defaultValue="NORMAL" required>
        <option value="NORMAL">Можно продолжать работу</option>
        <option value="HIGH">Сильно мешает работе</option>
        <option value="BLOCKER">Работа полностью остановлена</option>
      </select></label>
    </div>

    <label><span>Короткая тема</span><input name="subject" minLength={5} maxLength={120} placeholder="Например: не открывается карточка рейса" required /></label>
    <label><span>Опишите ошибку</span><textarea name="description" minLength={15} maxLength={4000} rows={5} placeholder="Что вы ожидали увидеть и что произошло на самом деле?" required /></label>
    <label><span>Как повторить проблему <small>необязательно</small></span><textarea name="steps_to_reproduce" maxLength={2000} rows={3} placeholder="Например: Рейсы → Подробнее → Посмотреть чек" /></label>
    <div className="support-form-grid">
      <label><span>Контакт для ответа <small>необязательно</small></span><input name="contact" maxLength={160} placeholder="Email или @telegram" /></label>
      <label className="support-file-field"><span>Скриншот <small>JPG, PNG или WEBP до 5 МБ</small></span><input name="attachment" type="file" accept="image/jpeg,image/png,image/webp" /></label>
    </div>

    <div className="support-submit-row">
      <span>Страница, устройство, часовой пояс и версия приложения приложатся автоматически.</span>
      <SubmitButton />
    </div>
    {state.message ? <p className={state.success ? "form-success" : "form-error"} role={state.success ? "status" : "alert"}>{state.message}</p> : null}
  </form>;
}
