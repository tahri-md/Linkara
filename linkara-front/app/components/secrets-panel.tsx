"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/use-toast";
import { fetchSecrets, createSecret, updateSecret, deleteSecret, type GqlSecret } from "@/lib/graphql-client";
import { formatDate } from "@/lib/format";

export function SecretsPanel({ token, orgId }: { token: string | null; orgId: string }) {
  const [secrets, setSecrets] = useState<GqlSecret[]>([]);
  const [newName, setNewName] = useState("");
  const [newValue, setNewValue] = useState("");
  const [rotatingId, setRotatingId] = useState<string | null>(null);
  const [rotateValue, setRotateValue] = useState("");
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const res = await fetchSecrets(token, orgId);
      setSecrets(res.secrets);
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't load secrets",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [orgId]);

  async function handleCreate() {
    if (!newName.trim() || !newValue.trim()) return;
    try {
      await createSecret(token, orgId, { name: newName.trim(), value: newValue });
      setNewName("");
      setNewValue("");
      await load();
      toast({ title: "Secret created" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Create failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleRotate(secretId: string) {
    if (!rotateValue.trim()) return;
    try {
      await updateSecret(token, orgId, secretId, rotateValue);
      setRotatingId(null);
      setRotateValue("");
      await load();
      toast({ title: "Secret value updated" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  async function handleDelete(secretId: string) {
    try {
      await deleteSecret(token, orgId, secretId);
      await load();
      toast({ title: "Secret deleted" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return (
    <div className="space-y-4">
      {loading ? (
        <p className="text-sm text-ink-500">Loading secrets...</p>
      ) : (
        <div className="space-y-2">
          {secrets.length === 0 && (
            <p className="text-sm text-ink-500">No secrets configured for this organization.</p>
          )}
          {secrets.map((s) => (
            <div key={s.id} className="rounded-md border border-ink-800 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-200">{s.name}</p>
                  <p className="text-xs text-ink-500">
                    Updated {formatDate(s.updated_at)}
                    {s.accessed_at ? ` · last used ${formatDate(s.accessed_at)}` : " · never used"}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setRotatingId(s.id)}>
                    Rotate
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                    Delete
                  </Button>
                </div>
              </div>
              {rotatingId === s.id && (
                <div className="mt-2 flex gap-2">
                  <Input
                    type="password"
                    placeholder="New value"
                    value={rotateValue}
                    onChange={(e) => setRotateValue(e.target.value)}
                  />
                  <Button size="sm" onClick={() => handleRotate(s.id)}>
                    Save
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-ink-800 p-3">
        <p className="text-sm font-medium text-ink-200">Add secret</p>
        <div className="grid gap-2 md:grid-cols-2">
          <Input placeholder="NAME (e.g. NPM_TOKEN)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input type="password" placeholder="Value" value={newValue} onChange={(e) => setNewValue(e.target.value)} />
        </div>
        <Button size="sm" onClick={handleCreate}>
          Add secret
        </Button>
      </div>
    </div>
  );
}