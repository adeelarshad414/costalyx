.PHONY: dev-up dev-down seed-demo test generate-client

dev-up:
	docker compose up -d

dev-down:
	docker compose down

seed-demo:
	npm run seed:demo

generate-client:
	npm run generate:client

test:
	npm test
