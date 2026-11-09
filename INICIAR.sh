#!/usr/bin/env bash
# Inicia o B2B Inteligente no Linux (o servidor liga o Ollama automaticamente).
cd "$(dirname "$0")"
NODE="${NODE:-$(command -v node || echo "$HOME/.local/bin/node")}"
echo "Site:  http://127.0.0.1:3000/"
echo "Login: http://127.0.0.1:3000/login"
echo "Deixe este terminal aberto. Ctrl+C para encerrar."
exec "$NODE" --env-file=.env src/server.mjs
