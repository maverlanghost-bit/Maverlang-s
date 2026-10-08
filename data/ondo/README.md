# Ondo vs xStocks (Solana), medido el 07-10-2026 de 22:45 a 22:57 (hora de Chile; sesión overnight de EE.UU.)

- `ondo-token-registry-2026-10-07.md`: copia del registro oficial (https://docs.ondo.finance/partner-docs/tokens). Es la única fuente de mints de Ondo. La API api.gm.ondo.finance pide una x-api-key (devuelve 403 sin ella).
- `ondo-registry.json`: el registro parseado (459 filas: 333 Stock, 118 ETF, 7 Portfolio y 1 Currency/USDon).
- `fetch_jup.py`: llama a Jupiter `tokens/v2/search` (volumen 24h compra+venta, liquidez y verificación) y a `price/v3`. Salida: `jup_tokens.json` y `jup_prices.json`.
- `coingecko_markets.json`: CoinGecko `/coins/markets` de las categorías xstocks-ecosystem y ondo-tokenized-assets. El volumen es de todas las redes y exchanges, así que solo sirve como referencia.
- `quote.py`: hace ida y vuelta de US$100 en Jupiter `/order` sin taker (no firma nada). Compra con 100 USDC y vende lo recibido. rt_bps = (1 − USDC recuperados/100)·10⁴, lo que no depende de multiplicadores. Resultado: `quotes_*.jsonl`.
- `build_csv.py` genera `../ondo-vs-xstocks-2026-10-07.csv`.

Regla del ganador: gana el emisor con mayor volumen 24h en Solana (Jupiter). Si ese emisor no cotiza ahora y el otro sí, gana el otro. ETF apalancados o inversos = excluir.
