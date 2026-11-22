/**
 * Muestra cómo activar los hooks versionados de `.githooks/` (OPS-2).
 * No toca la configuración de git: imprime el comando para que lo corras tú.
 */
console.log("Para activar el pre-commit que escanea secretos en lo que vas a commitear, corre una vez:");
console.log("");
console.log("  git config core.hooksPath .githooks");
console.log("");
console.log("Para desactivarlo: git config --unset core.hooksPath");
