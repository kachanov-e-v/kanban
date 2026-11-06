"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateProfile, updateAiSettings } from "@/lib/actions/profile";
import type { ProfileDTO } from "@/lib/actions/profile";

export function ProfileView({ initial }: { initial: ProfileDTO }) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [email, setEmail] = useState(initial.email);
  const [password, setPassword] = useState("");
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [profilePending, startProfile] = useTransition();

  const [aiProvider, setAiProvider] = useState(initial.aiProvider);
  const [aiBaseUrl, setAiBaseUrl] = useState(initial.aiBaseUrl);
  const [aiModel, setAiModel] = useState(initial.aiModel);
  const [aiApiKey, setAiApiKey] = useState(initial.aiApiKey);
  const [aiEnabled, setAiEnabled] = useState(initial.aiEnabled);
  const [aiMsg, setAiMsg] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(null);
  const [aiPending, startAi] = useTransition();

  function saveProfile() {
    setProfileMsg(null);
    setProfileErr(null);
    startProfile(async () => {
      try {
        await updateProfile({ name, email, password: password || undefined });
        setPassword("");
        setProfileMsg("Профиль сохранён");
        router.refresh();
      } catch (e) {
        setProfileErr(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  function saveAi() {
    setAiMsg(null);
    setAiErr(null);
    startAi(async () => {
      try {
        await updateAiSettings({
          provider: aiProvider,
          baseUrl: aiBaseUrl,
          model: aiModel,
          apiKey: aiApiKey,
          enabled: aiEnabled,
        });
        setAiMsg("Настройки ИИ сохранены");
        router.refresh();
      } catch (e) {
        setAiErr(e instanceof Error ? e.message : "Ошибка");
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6 flex flex-col gap-8">
      <h1 className="type-headline-small text-on-surface">Личный кабинет</h1>

      <section className="rounded-radius-lg bg-surface border-[3px] border-outline p-6 flex flex-col gap-4">
        <h2 className="type-title-large text-on-surface">Профиль</h2>
        <Input label="Имя" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input
          label="Новый пароль (оставьте пустым, чтобы не менять)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {profileErr && <p className="type-body-medium text-error">{profileErr}</p>}
        {profileMsg && <p className="type-body-medium text-on-surface">{profileMsg}</p>}
        <div className="flex justify-end">
          <Button onClick={saveProfile} loading={profilePending}>Сохранить профиль</Button>
        </div>
      </section>

      <section className="rounded-radius-lg bg-surface border-[3px] border-outline p-6 flex flex-col gap-4">
        <h2 className="type-title-large text-on-surface">API для ИИ-чата</h2>
        <p className="type-body-medium text-on-surface-variant">
          Укажите полный URL OpenAI-совместимого endpoint (например, https://api.openai.com/v1/chat/completions).
          Если поля пустые, используются значения из окружения сервера.
        </p>
        <div className="flex flex-col gap-1">
          <label className="type-label-large text-on-surface-variant">Провайдер</label>
          <select
            value={aiProvider}
            onChange={(e) => {
              const p = e.target.value;
              setAiProvider(p);
              if (p === "kilo" && !aiModel) setAiModel("reflection/beam-free");
              if (p === "openrouter" && !aiModel) setAiModel("openai/gpt-4o-mini");
            }}
            className="h-12 px-4 type-body-large rounded-radius-sm bg-surface border-[3px] border-outline text-on-surface focus:outline-none focus:border-primary"
          >
            <option value="kilo">Kilo (по умолчанию)</option>
            <option value="openrouter">OpenRouter</option>
            <option value="custom">Свой (custom)</option>
          </select>
        </div>
        <Input
          label="Base URL (переопределение, необязательно)"
          placeholder={
            aiProvider === "kilo"
              ? "https://api.kilo.ai/api/gateway/v1/chat/completions"
              : aiProvider === "openrouter"
              ? "https://openrouter.ai/api/v1/chat/completions"
              : "https://text.pollinations.ai/openai"
          }
          value={aiBaseUrl}
          onChange={(e) => setAiBaseUrl(e.target.value)}
        />
        <Input
          label="Модель"
          placeholder="openai"
          value={aiModel}
          onChange={(e) => setAiModel(e.target.value)}
        />
        <Input
          label="API ключ"
          type="password"
          placeholder="sk-..."
          value={aiApiKey}
          onChange={(e) => setAiApiKey(e.target.value)}
        />
        <label className="flex items-center gap-2 type-body-medium text-on-surface">
          <input
            type="checkbox"
            checked={aiEnabled}
            onChange={(e) => setAiEnabled(e.target.checked)}
            className="h-4 w-4"
          />
          ИИ включён
        </label>
        {aiErr && <p className="type-body-medium text-error">{aiErr}</p>}
        {aiMsg && <p className="type-body-medium text-on-surface">{aiMsg}</p>}
        <div className="flex justify-end">
          <Button onClick={saveAi} loading={aiPending}>Сохранить настройки ИИ</Button>
        </div>
      </section>
    </div>
  );
}