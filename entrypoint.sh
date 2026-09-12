#!/bin/sh
# Corre como root al iniciar el contenedor: arregla permisos de los volúmenes
# persistentes (que Railway monta como root, vacíos, al arrancar) y luego
# baja privilegios al usuario `app` antes de lanzar el proceso real.
#
# El CLI de Claude Code guarda su config en DOS lugares: el archivo
# /home/app/.claude.json (directo en el home) Y la carpeta /home/app/.claude/
# (backups, sesiones). Por eso el volumen persistente debe montarse en
# /home/app COMPLETO, no solo en /home/app/.claude — si solo se monta el
# subdirectorio, .claude.json queda fuera del volumen y se pierde en cada
# restart (visto en producción: "Claude configuration file not found").
set -e

if [ -d /home/app ]; then
  chown -R app:app /home/app
fi

if [ -d /app/data ]; then
  chown -R app:app /app/data
fi

exec gosu app "$@"
