#!/bin/bash
# Ensures .claude/skills symlinks to .agents/skills
# Run after cloning or if the symlink gets broken.

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$REPO_ROOT/.claude/skills"
SOURCE="$REPO_ROOT/.agents/skills"

if [ ! -d "$SOURCE" ]; then
  echo "Error: $SOURCE does not exist." >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/.claude"

if [ -L "$TARGET" ] && [ "$(readlink "$TARGET")" = "../.agents/skills" ]; then
  echo "Symlink already correct: $TARGET -> ../.agents/skills"
  exit 0
fi

[ -e "$TARGET" ] || [ -L "$TARGET" ] && rm -rf "$TARGET"
ln -s ../.agents/skills "$TARGET"
echo "Created: $TARGET -> ../.agents/skills"