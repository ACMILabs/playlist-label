help:
	@echo 'Individual commands:'
	@echo ' lint             - Lint the code with pylint and flake8 and check imports'
	@echo '                    have been sorted correctly'
	@echo ' test             - Run python tests'
	@echo ' lintjs           - Lint the JavaScript code with eslint'
	@echo ' testjs           - Run JavaScript tests'
	@echo ''
	@echo 'Grouped commands:'
	@echo ' linttest         - Run Python lint and test'
	@echo ' linttestjs       - Run JavaScript lint and test'	
install:
	# Install npm requirements for js testing
	npm install
lint:
	# Lint the python code
	pylint *
	flake8
	isort -rc --check-only .
test:
	# Run python tests
	env `cat /code/config.tmpl.env | xargs` pytest -v
lintjs:
	# Lint the JavaScript code
	npm run lint
testjs:
	# Run JavaScript tests
	npm run test
testjs-debug:
	# Run JavaScript tests with Chrome debugger
	# Add a `debugger;` statement to your tests, and open Chrome to chrome://inspect
	npm run test:debug
linttest: lint test
linttestjs: lintjs testjs
linttestall: lint test lintjs testjs
