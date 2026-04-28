#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

# Create venv if needed
if [ ! -d ".venv" ]; then
  echo "Creating virtualenv…"
  python3 -m venv .venv
fi

source .venv/bin/activate

# Install deps if needed
pip install -q -r requirements.txt

echo ""
echo "  ╔══════════════════════════════════════╗"
echo "  ║     Reclaim the Macer — starting     ║"
echo "  ║     http://localhost:5050            ║"
echo "  ╚══════════════════════════════════════╝"
echo ""

python3 app.py
