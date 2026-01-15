# Nestjs Jira TG bot

## Что умеет бот
- Создавать баги из супергрупп в вашу Jira (Название топика в супергруппе должно включать ключ проекта)
- Синкать с Github через вебхук и Action и публиковать ссылку на PR в комментариях к задаче в Jira (название ветки или ПР должны включать ключ проекта и номер задачи) (за автора комментария берется пользователь - владелец токена)
- В личке с ботом можно получать таблицы работы по задачам и отображать зарплату по часовой ставке или фиксированной за спринт

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

### Github Sync by Webhook and Action
Бот умеет синкаться с Github через вебхук и Action.
Пример Action лежит в workflows_example/pull-request-created.yml.
В вашем проекте нужно создать соответствующий vars.JIRA_PUSH_BOT_ENV, с телом:
```
JIRA_BOT_HOST=ваш хост
JIRA_BOT_SECRET=ваш секрет для вебхука
```

Так же требуется прописать его в ваш .env в для бота.

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

