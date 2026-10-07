import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/** Formulario GET: `/verificar?code=…` normaliza el código y redirige a `/verificar/<código>`. */
export function VerifyForm({ defaultValue, title = "Verificar otro código" }: { defaultValue?: string; title?: string }) {
  return (
    <form action="/verificar" method="get" className="flex flex-col gap-2">
      <Label htmlFor="verify-code" className="text-sm font-medium">
        {title}
      </Label>
      <div className="flex gap-2">
        <Input
          id="verify-code"
          name="code"
          placeholder="PC-XXXX-XXXX"
          defaultValue={defaultValue}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={20}
          required
        />
        <Button type="submit">Verificar</Button>
      </div>
    </form>
  );
}
