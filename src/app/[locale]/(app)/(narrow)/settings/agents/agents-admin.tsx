"use client";

import { Check, Copy } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/confirm-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { createAgentAction, revokeAgentAction } from "@/modules/agents/actions";
import type { AgentView } from "@/modules/agents/service";

/** The server name in Claude Code: letters only, whatever the agent is called. */
const SERVER_NAME = "facade";

export function AgentsAdmin({
  agents,
  canManage,
  endpoint,
}: {
  agents: AgentView[];
  canManage: boolean;
  endpoint: string;
}) {
  const t = useTranslations("settings.agents");
  const format = useFormatter();
  const [name, setName] = useState("");
  const [access, setAccess] = useState<"read" | "write">("read");
  const [issued, setIssued] = useState<{ name: string; command: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const made = await createAgentAction({ name, access });
    if (!made.ok) return void toast.error(t("failed"));
    setIssued({
      name,
      command: `claude mcp add --transport http ${SERVER_NAME} ${endpoint} --header "Authorization: Bearer ${made.data.token}"`,
    });
    setCopied(false);
    setName("");
  }

  return (
    <div className="flex max-w-2xl flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <p className="text-meta text-2sm leading-relaxed">{t("subtitle")}</p>
      </div>

      <div className="border-border bg-warning-tint rounded-lg border p-4">
        <p className="text-2sm leading-relaxed">
          <strong className="font-semibold">{t("privacyTitle")}. </strong>
          {t("privacy")}
        </p>
        <p className="text-2sm mt-2 leading-relaxed">{t("trust")}</p>
      </div>

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("addTitle")}</CardTitle>
            <CardDescription>{t("accessHint")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <form onSubmit={(e) => void create(e)} className="flex flex-wrap items-end gap-2">
              <div className="flex min-w-48 flex-1 flex-col gap-1.5">
                <Label htmlFor="agent-name">{t("name")}</Label>
                <Input
                  id="agent-name"
                  required
                  maxLength={60}
                  value={name}
                  placeholder={t("namePlaceholder")}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="agent-access">{t("access")}</Label>
                <NativeSelect
                  id="agent-access"
                  value={access}
                  onChange={(e) => setAccess(e.target.value as "read" | "write")}
                >
                  <option value="read">{t("read")}</option>
                  <option value="write">{t("write")}</option>
                </NativeSelect>
              </div>
              <Button type="submit">{t("create")}</Button>
            </form>
            {issued && (
              <div className="bg-accent/60 border-border flex flex-col gap-2 rounded-lg border p-3 text-sm">
                <p className="font-medium">{t("issued", { name: issued.name })}</p>
                <code className="bg-card border-border rounded border px-2 py-1 text-xs break-all">
                  {issued.command}
                </code>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-fit"
                  onClick={() => {
                    void navigator.clipboard.writeText(issued.command);
                    setCopied(true);
                  }}
                >
                  {copied ? <Check data-slot="icon" /> : <Copy data-slot="icon" />}
                  {copied ? t("copied") : t("copy")}
                </Button>
                <p className="text-meta text-xs">{t("issuedHint")}</p>
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <p className="text-meta text-sm">{t("managersOnly")}</p>
      )}

      <section>
        <h3 className="mb-2 text-sm font-semibold">{t("listTitle")}</h3>
        {agents.length === 0 && <p className="text-meta text-sm">{t("none")}</p>}
        <ul>
          {agents.map((agent) => (
            <li
              key={agent.id}
              className="border-hairline flex items-center justify-between gap-3 border-b py-2"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{agent.name}</span>
                <span className="text-meta block text-xs">
                  {agent.access === "write" ? t("write") : t("read")},{" "}
                  {agent.lastUsedAt
                    ? t("lastUsed", {
                        when: format.dateTime(new Date(agent.lastUsedAt), {
                          dateStyle: "short",
                          timeStyle: "short",
                        }),
                      })
                    : t("neverUsed")}
                </span>
              </span>
              {canManage && (
                <ConfirmButton
                  variant="ghost"
                  title={t("revokeTitle", { name: agent.name })}
                  body={t("revokeBody")}
                  confirmLabel={t("revoke")}
                  onConfirm={() => revokeAgentAction({ id: agent.id })}
                >
                  {t("revoke")}
                </ConfirmButton>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
