SHELL=/bin/bash -o pipefail
# Project source directory; this must be at the top before other includes
ROOT_PATH													:= $(shell dirname $(abspath $(lastword $(MAKEFILE_LIST))))
APPLICATIONS_COMMON_ROOT_PATH			:= $(shell dirname $(realpath $(abspath $(lastword $(MAKEFILE_LIST)))))

-include Makefile.vars
-include Makefile.vars.local
-include Makefile.project

ECR_IMAGE_REPOSITORY = ${AWS_IMAGE_REPOSITORY}


PROJECT_BUILD_DATE								:= $(shell date -u +"%Y%m%d.%H%M%S")
PROJECT_BUILD_DATE_3339						:= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
PROJECT_GIT_REPOSITORY						:= $(shell git config --get remote.origin.url)
PROJECT_GIT_NAME									:= $(shell basename $(shell git config --get remote.origin.url 2>/dev/null || echo $(ROOT_PATH)) .git)
PROJECT_GIT_SHA										:= $(shell git rev-parse HEAD)
PROJECT_GIT_SHA_SHORT							:= $(shell git rev-parse --short HEAD)
PROJECT_GIT_TOPIC_BRANCH					:= $(shell git rev-parse --abbrev-ref=strict HEAD)
PROJECT_GIT_MAINLINE_BRANCH				?= master
PROJECT_GIT_STAGING_BRANCH				?= staging
PROJECT_GIT_HOTFIX_BRANCH					?= hotfix


# Generate version information using most recent git tag version and commit counts
# <version-tag>-<mainline-commits>[-<topic-label>][-<topic-commits>]

# Get the tag representing version from mainline, only search parent; default to v0
PROJECT_GIT_VERSION_TAG						:= $(shell git describe --tags --first-parent --match v[0-9]* --abbrev=0 $(PROJECT_GIT_MAINLINE_BRANCH) 2>/dev/null || echo v0)

# Determine commit when topic branched off mainline
# Count number of commits on topic since branchpoint
# Count number of commits on mainline since version tag
PROJECT_GIT_BRANCHPOINT						:= $(shell git merge-base HEAD $(PROJECT_GIT_MAINLINE_BRANCH))
PROJECT_GIT_TOPIC_COMMITS					:= $(shell git rev-list $(PROJECT_GIT_BRANCHPOINT)..HEAD --count --first-parent 2>/dev/null || echo 0)
PROJECT_GIT_MAINLINE_COMMITS			:= $(shell git rev-list $(PROJECT_GIT_VERSION_TAG)..$(PROJECT_GIT_BRANCHPOINT) --count --first-parent 2>/dev/null || echo 0)

# Check if workspace is dirty with untracked / uncommitted changes
PROJECT_GIT_WORKSPACE_DIRTY				:= $(shell [ -z "$$(git status --porcelain)" ] || echo -dirty)
PROJECT_GIT_WORKSPACE_UNPUSHED		:= $(shell [ "$$(git cherry 2>/dev/null)" == "" ] || echo -unpushed)

# Use SHA for label prefix;  Specific topics can have defined labels instead;
PROJECT_GIT_TOPIC_LABEL						:= $(PROJECT_GIT_SHA_SHORT)
PROJECT_GIT_TOPIC_LABEL						:= $(if $(filter $(PROJECT_GIT_MAINLINE_BRANCH),$(PROJECT_GIT_TOPIC_BRANCH)),$(PROJECT_GIT_MAINLINE_BRANCH),$(PROJECT_GIT_TOPIC_LABEL))
PROJECT_GIT_TOPIC_LABEL						:= $(if $(filter $(PROJECT_GIT_STAGING_BRANCH),$(PROJECT_GIT_TOPIC_BRANCH)),$(PROJECT_GIT_STAGING_BRANCH),$(PROJECT_GIT_TOPIC_LABEL))
PROJECT_GIT_TOPIC_LABEL						:= $(if $(filter $(PROJECT_GIT_HOTFIX_BRANCH),$(PROJECT_GIT_TOPIC_BRANCH)),$(PROJECT_GIT_HOTFIX_BRANCH),$(PROJECT_GIT_TOPIC_LABEL))

# Project version;  append topic label and commits if not mainline
PROJECT_VERSION										:= $(PROJECT_GIT_VERSION_TAG)-$(PROJECT_GIT_MAINLINE_COMMITS)
PROJECT_VERSION										:= $(if $(filter $(PROJECT_GIT_MAINLINE_BRANCH),$(PROJECT_GIT_TOPIC_BRANCH)),$(PROJECT_VERSION),$(PROJECT_VERSION)-$(PROJECT_GIT_TOPIC_LABEL)-$(PROJECT_GIT_TOPIC_COMMITS))

# Build label to be used for artifacts; includes build number which may be passed in;
PROJECT_BUILD_LABEL								:= $(PROJECT_VERSION)$(PROJECT_GIT_WORKSPACE_DIRTY)$(PROJECT_GIT_WORKSPACE_UNPUSHED)

RELEASE_IMAGE_BUILD_OPTS					:= --force-rm


ifeq (${IMAGE_SERVICE_NAME},)
  IMAGE_NAME ?= $(IMAGE_NAME)
else
  IMAGE_NAME = ${IMAGE_SERVICE_NAME}
endif

IMAGE_ENVIRONMENT									?= ${PROJECT_ENVIRONMENT}
IMAGE_REPOSITORY									?= $(ECR_IMAGE_REPOSITORY)/$(PROJECT_NAME)/$(IMAGE_ENVIRONMENT)/$(IMAGE_NAME)
IMAGE_DOCKERFILE									?= "${PROJECT_IMAGE_DOCKERFILE}"
IMAGE_CONTEXT											?= .
IMAGE_TAG													?= latest
IMAGE_UNIQUE_TAG									?= $(PROJECT_BUILD_DATE)
IMAGE_LABELS											:= --label=org.label-schema.name="$(NAME)" \
																			--label=org.label-schema.url="$(PROJECT_GIT_REPOSITORY)" \
																			--label=org.label-schema.vcs-url="$(PROJECT_GIT_REPOSITORY)" \
																			--label=org.label-schema.vcs-ref="$(PROJECT_GIT_SHA)" \
																			--label=org.label-schema.vendor="workspace" \
																			--label=org.label-schema.version="$(patsubst %-latest,%,$(PROJECT_BUILD_LABEL)-$(IMAGE_TAG))" \
																			--label=org.label-schema.build-date="$(PROJECT_BUILD_DATE_3339)" \
																			--label=org.label-schema.schema-version="1.0"
.PHONY: docker-build-image
docker-build-image								:
																	docker build $(RELEASE_IMAGE_BUILD_OPTS) \
																		--tag $(IMAGE_REPOSITORY):$(IMAGE_TAG) \
																		$(IMAGE_LABELS) \
																		-f $(IMAGE_DOCKERFILE) $(IMAGE_CONTEXT)

.PHONY: docker-push-image
docker-push-image									:
																	docker push $(IMAGE_REPOSITORY):$(IMAGE_TAG)