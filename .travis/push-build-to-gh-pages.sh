#!/bin/bash

if [ "$TRAVIS_REPO_SLUG" == "mdehoog/Stat.Map" ] && [ "$TRAVIS_PULL_REQUEST" == "false" ]; then
  
  echo -e "Publishing build...\n"
  
  cp -R build/app $HOME/app-latest
  
  cd $HOME
  git config --global user.email "travis@travis-ci.org"
  git config --global user.name "travis-ci"
  git clone --quiet --branch=gh-pages https://${GH_TOKEN}@github.com/mdehoog/Stat.Map gh-pages > /dev/null

  cd gh-pages
  git rm -rf * > /dev/null
  cp -Rf $HOME/app-latest/* .
  git add -f .
  git commit -m "Lastest build on successful travis build $TRAVIS_BUILD_NUMBER auto-pushed to gh-pages"
  git push -fq origin gh-pages > /dev/null

  echo -e "Published build to gh-pages.\n"
  
fi