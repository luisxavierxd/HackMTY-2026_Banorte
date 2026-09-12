#!/bin/sh
# Corre como root al iniciar el contenedor: arregla permisos de los volúmenes
# persistentes (que Railway monta como root, vacíos, al arrancar) y luego
# baja privilegios al usuario `app` antes de lanzar el proceso real.
#
# Sin esto, un volumen recién montado en /home/app/.claude (credenciales del
# CLI de Claude Code) o /app/data (estado sintético) queda ilegible para el
# usuario `app`, y el proceso truena en el primer request en vez de en el build.
set -e

if [ -d /home/app/.claude ]; then
  chown -R app:app /home/app/.claude
fi

if [ -d /app/data ]; then
  chown -R app:app /app/data
fi

exec gosu app "$@"
