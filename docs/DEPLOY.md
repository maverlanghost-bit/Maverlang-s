# DEPLOY — Maverlang

## Cómo se despliega

- **Vercel** despliega automáticamente: preview por rama/PR (M50) y producción al llegar a `main`.
- El CI de GitHub Actions (`.github/workflows/ci.yml`) **no despliega**: sólo verifica. Su trabajo es que nada roto llegue a `main`, donde Vercel produce.

## Rama main protegida (M87)

> Esta sección documenta las reglas **recomendadas** para GitHub. La activación es una decisión de Manu (Settings → Branches → Add branch ruleset sobre `main`); con el repo en GitHub ya se puede aplicar tal cual.

Reglas recomendadas para `main`:

1. **Checks obligatorios antes del merge**: exigir los jobs del CI en verde:
   - `checks` (typecheck, lint, test, scan:secrets, audit:deps)
   - `build` (build de producción, el gate de Vercel)
   - `e2e` (Playwright chromium; en fallo sube el artefacto `playwright-e2e` con reporte y trazas)
2. **Sin force-push** a `main` y **sin borrado** de la rama.
3. **Historial lineal**: merge que no cree merge-commits ("Restrict merges: sólo rebase o squash", según prefiera Manu).
4. **PR o push directo, a elección de Manu**: 
   - Opción A (PR): `Require a pull request before merging` con los checks anteriores; todo cambio entra revisado y con CI verde.
   - Opción B (push directo): sin PR obligatorio, pero con `Require status checks to pass` activo el push a `main` se rechaza si `checks`/`build`/`e2e` no están verdes para el commit.
   - Con CODEOWNERS activo, los paths sensibles (`supabase/migrations/**`, `lib/trade/**`, `lib/onramp/**`, `lib/kyc/**`) piden además revisión de `@Mbrop-13` (ver `.github/CODEOWNERS`).
5. **Despliegue**: después de cada merge a `main` verde, Vercel despliega a producción; revisar el deployment en el dashboard antes de anunciar.

### Checklist al activar las reglas

- [ ] Branch ruleset sobre `main` con los 3 checks requeridos (nombres exactos de los jobs del CI).
- [ ] "Block force pushes" y "Restrict deletions" activados.
- [ ] Política de merge elegida por Manu (PR obligatorio o push directo con checks).
- [ ] CODEOWNERS revisado (los 4 paths sensibles apuntan a `@Mbrop-13`).
- [ ] Un PR de prueba pasa por el circuito completo (checks + build + e2e + merge).
