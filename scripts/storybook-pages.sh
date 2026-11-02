#!/usr/bin/env bash
# Usage: storybook-pages.sh <dir> [<built storybook>]
# Replaces <dir> on the gh-pages branch with the build, or removes it when no build is given. <dir> "." is the site
# root (main); it keeps branch/, where the branch previews live.
#
# gh-pages is always a single commit, so preview builds don't pile up in every clone. Each run rebuilds that commit
# from the current tip and pushes with a lease on it: if another branch deployed in between, the push is refused and
# the run starts again from the new tip, so concurrent deploys never drop each other's folders.
set -euo pipefail
dir=$1
src=${2:-}
wt="$RUNNER_TEMP/gh-pages"

for attempt in 1 2 3 4 5; do
  git worktree remove -f "$wt" 2>/dev/null || true
  if git fetch -q --depth 1 origin gh-pages; then
    lease=$(git rev-parse FETCH_HEAD)
    git worktree add -q --detach "$wt" FETCH_HEAD
  else
    lease= # an empty lease means the branch must not exist yet
    git worktree add -q --detach "$wt" HEAD
    git -C "$wt" rm -rqf .
  fi

  if [ "$dir" = . ]; then
    find "$wt" -mindepth 1 -maxdepth 1 ! -name .git ! -name branch -exec rm -rf {} +
  else
    rm -rf "${wt:?}/$dir"
  fi
  if [ -n "$src" ]; then
    mkdir -p "$wt/$dir"
    cp -r "$src/." "$wt/$dir/"
  fi
  touch "$wt/.nojekyll"

  git -C "$wt" add -A
  tree=$(git -C "$wt" write-tree)
  if [ -n "$lease" ] && [ "$tree" = "$(git rev-parse "$lease^{tree}")" ]; then
    echo "gh-pages already up to date"
    exit 0
  fi
  commit=$(git -c user.name="github-actions[bot]" -c user.email="github-actions[bot]@users.noreply.github.com" \
    commit-tree "$tree" -m "Storybook: $([ -n "$src" ] && echo publish || echo remove) $dir at ${GITHUB_SHA::7}")
  if git push -q --force-with-lease="refs/heads/gh-pages:$lease" origin "$commit:refs/heads/gh-pages"; then
    exit 0
  fi
  echo "gh-pages moved; retrying ($attempt)"
  sleep $((attempt * 3))
done
exit 1
