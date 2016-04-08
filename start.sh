#!/bin/bash

PORCH_REPO_BASE=porchdotcom
PORCH_REPO_NAME=frontend-connection

echo "clone time"
git clone --depth 1 git@github.com:$PORCH_REPO_BASE/$PORCH_REPO_NAME.git

echo "cd time"
cd $PORCH_REPO_NAME

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