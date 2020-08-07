.DEFAULT_GOAL := default
.PHONY: default build shell console deploy

default:
	(docker-compose up --abort-on-container-exit; docker-compose down)

build:
	docker-compose build

shell:
	docker-compose run --rm notepad bash

console:
	docker-compose run --rm notepad irb -r ./notepad.rb

deploy:
	git push -f heroku master
