help:
	@echo 'Individual commands:'
	@echo ' lint             - Lint the code with pylint and flake8 and check imports'
	@echo '                    have been sorted correctly'
	@echo ' test             - Run tests'
	@echo ''
	@echo 'Grouped commands:'
	@echo ' linttest         - Run lint and test'	
install:
	# Install npm requirements for js testing
	npm install
lint:
	# Lint the python code
	pylint *
	flake8
	isort -rc --check-only .
	# Lint the javascript code
	npm run lint
test:
	# Run python tests
	pytest -v
	# Run javascript tests
	npm run test
linttest: lint test
