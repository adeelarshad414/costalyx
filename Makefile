.PHONY: dev-up dev-down test generate-client

dev-up:
	docker compose up -d

dev-down:
	docker compose down

generate-client:
	npm run generate:client

test:
	npm test
