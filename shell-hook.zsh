# sessionboard shell integration
# Add this to your ~/.zshrc:
#   source /path/to/sessionboard-app/shell-hook.zsh

_SB_SOCK="$HOME/.sessionboard/agent.sock"

_sb_send() {
  [[ -S "$_SB_SOCK" ]] || return
  echo "$1" | nc -U "$_SB_SOCK" 2>/dev/null &!
}

_sb_register() {
  _sb_send "{\"type\":\"register\",\"pid\":$$,\"cwd\":\"$PWD\"}"
}

_sb_deregister() {
  _sb_send "{\"type\":\"deregister\",\"pid\":$$,\"cwd\":\"$PWD\"}"
}

# Update cwd on every prompt
_sb_precmd() {
  _sb_send "{\"type\":\"update\",\"pid\":$$,\"cwd\":\"$PWD\"}"
}

precmd_functions+=(_sb_precmd)
trap '_sb_deregister' EXIT
_sb_register

# sb-notify: call this from Claude Code hooks or manually to flag a session
# Usage: sb-notify "Claude is waiting"
sb-notify() {
  local text="${1:-Waiting for input}"
  _sb_send "{\"type\":\"notify\",\"pid\":$$,\"text\":\"$text\"}"
}
