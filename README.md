# Nestjs Jira TG bot

## RU
Nest.js телеграм бот, для отправки сообщений и картинок задачами в Jira, сбора таблиц работы над задачами и зарплаты

## EN
Nest.js telegram bot for sending messages and images to Jira, collecting tables of work on tasks and salary

### Development
Для корректной локальной работы, необходимо создать файл .env.dev и заполнить его переменными окружения, аналогичными .env.example, с учетом ваших доступов к проектам в Jira.

Локально проект запускается командой:
```bash
pnpm run start:dev
```

Для деплоя на сервер понадобится настроить Action/Secrets в Github.
Конретно используемые аргументы из env окружения сборки описаны в файле github/workflows/production-deploy.yaml


### Конфигурация
Бот покрывает доступ к задачам из вне при помощи 2х переменных окружения:

```
SUPERADMIN_LIST=Это набор никнеймов или ИД телеграм пользователей, которые будут иметь доступ ко всему функционалу бота и всем задачам в спринтах
```

```
AVAILABILITY_BY_KEYS=Доступ для остальных пользователей к задачам в проекте, который указан в ключе
```

Конфигурация связи телеграм пользователей с Jira пользователями по почте или displayName:

```
RELATION_BY_NAME_OR_EMAIL=никнейм_или_ид_телеграм_пользователя:displayName:email,etc.
```

Конфигурация связи телеграм пользователей с зарплатой по проекту или по всем сразу:

```
SALARY_RELATION_BY_TG_AND_PROJECT=tgNicknameOrId1:{amount=<number>,currency=<currency>,type=<fixed|hourly>}|tgNicknameOrId2:{key=<projectKey>,amount=<number>,currency=<currency>,type=<fixed|hourly>}
```

- ```<number> - сумма, например 3000 или 25 или любая другая``` - сумма зарплаты
- ```<currency> - например USDT или RUB или любая другая``` - просто ключ валюты
- ```<type> - например fixed или hourly``` - тип зарплаты, фиксированная за спринт или часовая
- ```<projectKey> - ключ проекта из Jira``` - можно не указывать, тогда зарплата будет считаться по всем проектам
- ```|``` - разделитель между пользователями
- ```,``` - разделитель между параметрами зарплаты
- ```:``` - разделитель между параметрами пользователя
- ```=``` - разделитель между ключом и значением

____


# Run
Проект сделан на основе бойлерплейта, описание которого можно найти в статьях:
- [2024 Nest.js Boilerplate with Firebase and GCloud with CRUD Example (Currently available in RU lang only)](http://github.com/Fedorrychkov/Fedorrychkov/articles/nestjs-boilerplate-startup/ARTICLE.md)
  - [VC.ru](https://vc.ru/dev/1353099-nestjs-firebase-gcloud-kak-bystro-podnyat-api-backend-na-typescript) - RUS
  - [Habr.ru](https://habr.com/ru/articles/835124/) - RUS
  - [Dev.to](https://dev.to/stonedcatt/nestjs-firebase-gcloud-how-to-quickly-set-up-an-api-backend-in-typescript-9no) - ENG

## Local
- ```pnpm run start:dev``` - for hot reload application running
- ```firebase init``` - for firebase-tools creation settings for your firebase project
- ```firebase deploy --only firestore:indexes``` - for firestore indexes deployment by firestore.indexes.json file 

___

<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="200" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://coveralls.io/github/nestjs/nest?branch=master" target="_blank"><img src="https://coveralls.io/repos/github/nestjs/nest/badge.svg?branch=master#9" alt="Coverage" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Installation

```bash
$ pnpm install
```

## Running the app

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Test

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://kamilmysliwiec.com)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](LICENSE).
