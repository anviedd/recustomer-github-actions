# Add ReCustomer Github Action to Project

## Init Submodule
```shell
git submodule add https://github.com/anviedd/recustomer-github-actions .build-utils
```

## Create Makefile.vars in root dir Project
* Example:
```shell
PROJECT_NAME = tracking
IMAGE_NAME = interface
```

## Add Github action
* Follow sample action in ```.github/workflows/actions.yml```