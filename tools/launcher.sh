#!/usr/bin/env bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PORT="${PORT:-3000}"
URL="http://localhost:${PORT}/"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/server.log"

cd "$PROJECT_DIR" || exit 1

find_pid() {
  lsof -tiTCP:"$PORT" -sTCP:LISTEN 2>/dev/null | head -n 1
}

pause() {
  printf "\nPress Enter to continue..."
  read -r _
}

clear_screen() {
  printf "\033c"
}

check_environment() {
  clear_screen
  echo "Environment check"
  echo
  if command -v node >/dev/null 2>&1; then
    echo "[OK] Node.js $(node --version)"
  else
    echo "[MISSING] Node.js was not found in PATH."
  fi

  [ -f "$PROJECT_DIR/server.js" ] && echo "[OK] server.js" || echo "[MISSING] server.js"
  [ -f "$PROJECT_DIR/public/index.html" ] && echo "[OK] public/index.html" || echo "[MISSING] public/index.html"
  [ -f "$PROJECT_DIR/public/app.js" ] && echo "[OK] public/app.js" || echo "[MISSING] public/app.js"
  [ -f "$PROJECT_DIR/data/anime.json" ] && echo "[OK] data/anime.json" || echo "[INFO] data/anime.json will be created on first start."
  [ -f "$PROJECT_DIR/outputs/anime.xlsx" ] && echo "[OK] outputs/anime.xlsx" || echo "[INFO] outputs/anime.xlsx will be created on start."

  pid="$(find_pid)"
  if [ -n "$pid" ]; then
    echo "[RUNNING] Port $PORT is listening. PID: $pid"
  else
    echo "[STOPPED] No service is listening on port $PORT."
  fi
  pause
}

start_app() {
  clear_screen
  if ! command -v node >/dev/null 2>&1; then
    echo "Node.js was not found. Choose option 5 for install guide."
    pause
    return
  fi

  pid="$(find_pid)"
  if [ -n "$pid" ]; then
    echo "App is already running at $URL"
    echo "PID: $pid"
    pause
    return
  fi

  mkdir -p "$LOG_DIR" "$PROJECT_DIR/data" "$PROJECT_DIR/outputs"
  echo "Starting app..."
  nohup node "$PROJECT_DIR/server.js" >"$LOG_FILE" 2>&1 &
  sleep 2

  pid="$(find_pid)"
  if [ -n "$pid" ]; then
    echo "Started successfully: $URL"
    echo "PID: $pid"
    echo "Log file: $LOG_FILE"
  else
    echo "Start command was sent, but port $PORT is not listening yet."
    echo "Log file: $LOG_FILE"
    echo "Try running: npm start"
  fi
  pause
}

stop_app() {
  clear_screen
  pid="$(find_pid)"
  if [ -z "$pid" ]; then
    echo "App is not running."
    pause
    return
  fi
  echo "Stopping PID $pid ..."
  kill "$pid" 2>/dev/null || true
  sleep 1
  if kill -0 "$pid" 2>/dev/null; then
    kill -9 "$pid" 2>/dev/null || true
  fi
  echo "Stopped."
  pause
}

open_page() {
  pid="$(find_pid)"
  if [ -z "$pid" ] && command -v node >/dev/null 2>&1; then
    mkdir -p "$LOG_DIR" "$PROJECT_DIR/data" "$PROJECT_DIR/outputs"
    nohup node "$PROJECT_DIR/server.js" >"$LOG_FILE" 2>&1 &
    sleep 2
  fi
  open "$URL"
}

node_guide() {
  clear_screen
  echo "Node.js install guide"
  echo
  echo "1. Install Node.js 20 or newer."
  echo "2. Recommended download page: https://nodejs.org/"
  echo "3. If you use Homebrew, you can run: brew install node"
  echo "4. Reopen this launcher and choose option 1 to check again."
  echo
  printf "Open Node.js download page? (y/N): "
  read -r answer
  case "$answer" in
    y|Y) open "https://nodejs.org/" ;;
  esac
}

while true; do
  clear_screen
  echo "============================================"
  echo "  Bangumi Anime Manager Launcher"
  echo "============================================"
  echo
  echo "  Project: $PROJECT_DIR"
  echo
  echo "  1. Check environment and resources"
  echo "  2. Start app"
  echo "  3. Stop app"
  echo "  4. Open web page"
  echo "  5. Node.js install guide"
  echo "  0. Exit"
  echo
  printf "Choose: "
  read -r choice
  case "$choice" in
    1) check_environment ;;
    2) start_app ;;
    3) stop_app ;;
    4) open_page ;;
    5) node_guide ;;
    0) exit 0 ;;
  esac
done
