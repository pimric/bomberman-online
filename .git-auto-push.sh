#!/bin/bash
git add .
git commit -m "Bomberman auto-update $(date '+%Y-%m-%d %H:%M:%S')"
git push origin main
echo "Modifications du projet Bomberman poussées automatiquement à $(date 
'+%H:%M:%S')"
