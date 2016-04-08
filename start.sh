#!/bin/bash

PORCH_REPO_BASE=porchdotcom

PER_PAGE=100
PAGE=0

while true; do
  echo "fetch repos page $PAGE"
  # Get repos...paginated, so make sure to keep fetching
  repos=(`curl -sfu $GITHUB_AUTH "https://api.github.com/orgs/$PORCH_REPO_BASE/repos?per_page=$PER_PAGE&page=$PAGE" | jq --raw-output '.[] | select(.language == "JavaScript") | .name'`)

  if [ ${#repos[@]} -eq 0 ]; then
      echo "no more repos"
      exit
  fi

  for repo in ${repos[@]}; do
    echo "repo time $repo"

    if [ "$repo" = "$PACKAGE" ]; then
      continue;
    fi

    # test if package.json exists in this repo and tell curl to fail on http errors so we can abort early
    curl -sfu $GITHUB_AUTH https://api.github.com/repos/porchdotcom/$repo/contents/package.json | jq --raw-output '.content' | base64 -d | grep $PACKAGE
    if [ $? -ne 0 ]; then
        echo "$PACKAGE not found in package.json"
        continue
    fi

    echo "$PACKAGE found in $repo's package.json"

    echo "clone time"
    git clone --depth 1 git@github.com:/$PORCH_REPO_BASE/$repo.git $repo

    echo "cd time"
    cd $repo

    echo "checkout time"
    git checkout -B goldkeeper-$PACKAGE

    echo "update time"
    ncu -a -r http://npm.mgmt.porch.com $PACKAGE

    echo "commit time"
    git commit -a -m "goldkeeper bump of $PACKAGE";

    echo "push time"
    git push -fu origin HEAD

    echo "pr time"
    hub pull-request -m "goldkeeper bump of $PACKAGE"

    echo "undo cd time"
    cd ..
  done

  PAGE=$((PAGE + 1))
done
