import test from "node:test";
import assert from "node:assert/strict";
import { retornoPortal, parametroRetorno } from "../src/lib/retornoPortal.ts";
test("Recuperação preserva o endereço público da oficina", () => {
  const path = "/oficina/oficina-horizonte";
  assert.equal(retornoPortal(parametroRetorno(path)), path);
});
test("Recuperação sem portal mantém o fluxo existente", () => {
  assert.equal(retornoPortal(""), null);
  assert.equal(parametroRetorno(null), "");
});
test("Recuperação não aceita redirecionamento externo ou rota interna", () => {
  for (const p of [
    "https://evil.test",
    "//evil.test",
    "/clientes",
    "/oficina/../../clientes",
    "/oficina/abc",
    "/oficina/abcd?x=1",
    "/oficina/abcd#x",
    "javascript:alert(1)",
    "/oficina/abcd/",
    "/oficina/abcd\\evil",
  ])
    assert.equal(retornoPortal("?retorno=" + encodeURIComponent(p)), null, p);
});
