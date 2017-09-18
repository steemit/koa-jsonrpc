
SHELL := /bin/bash
PATH  := ./node_modules/.bin:$(PATH)

SRC_FILES := $(shell find src -name '*.ts')

all: lib

lib: $(SRC_FILES) node_modules tsconfig.json
	tsc -p tsconfig.json --outDir lib
	touch lib

.PHONY: coverage
coverage: node_modules
	nyc -r html -r text -e .ts -i ts-node/register mocha --reporter nyan --require ts-node/register test/*.ts

.PHONY: test
test: node_modules
	mocha --require ts-node/register test/*.ts --grep '$(grep)'

.PHONY: ci-test
ci-test: node_modules
	nsp check
	tslint -p tsconfig.json -c tslint.json
	nyc -r lcov -e .ts -i ts-node/register mocha --reporter tap --require ts-node/register test/*.ts

.PHONY: lint
lint: node_modules
	tslint -p tsconfig.json -c tslint.json -t stylish --fix

node_modules:
	yarn install --non-interactive

.PHONY: clean
clean:
	rm -rf lib/

.PHONY: distclean
distclean: clean
	rm -rf node_modules/
