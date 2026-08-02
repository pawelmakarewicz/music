# Radio Paradise → TIDAL

Однонаправленная синхронизация оценённых (rating > 5) песен из Radio Paradise
в существующий плейлист TIDAL. Скрипт **никогда не удаляет** треки из TIDAL и
не добавляет кандидаты с низкой уверенностью.

## Настройка

```bash
npm install
cp .env.example .env
```

1. Создайте приложение в [TIDAL Developer](https://developer.tidal.com/) и
   в его настройках зарегистрируйте redirect URI
   `http://127.0.0.1:8787/callback` (или укажите свой в `.env`). Скопируйте
   только `Client ID` в `TIDAL_CLIENT_ID`; Client secret и пароль не нужны.
2. Откройте плейлист TIDAL в браузере: UUID в URL — это `TIDAL_PLAYLIST_ID`.
   Укажите также страну каталога, например `PL`.

## Запуск

Сохраните экспорт RP как `rp_favorites.txt` в корне проекта (он добавлен
в `.gitignore`). Формат — одна запись `Title - Artist` на строку. Затем:

```bash
npm run extract
```

При первом запуске все избранные считаются новыми. После успешного `sync`
создаётся локальный снимок. В следующий раз замените `rp_favorites.txt`
свежим экспортом и выполните `npm run extract`: в
`.data/radio-paradise-tracks.json` попадёт только разница.

Синхронизация:

```bash
npm run tidal:login
npm run sync
```

`tidal:login` выведет ссылку: откройте её, войдите в TIDAL и подтвердите
доступ. Access и refresh tokens сохраняются только в игнорируемом
`.data/tidal-token.json` и автоматически обновляются перед истечением срока.

Результат пишется в `reports/sync-*.json`: `added`, `alreadyPresent`,
`notFound`, `ambiguous` и `errors`. `ambiguous` специально не добавляются —
их можно просмотреть, подправить источник и запустить снова.

Запросы соответствуют TIDAL JSON:API: поиск — `GET /searchResults/{query}` с
`include=tracks`, добавление — `POST /playlists/{id}/relationships/items`.
TIDAL принимает максимум 50 элементов за POST. Все ответы TIDAL и локальный
файл треков проверяются Zod-схемами; при изменении контракта API скрипт
завершится с понятной `contract violation`, а не добавит некорректные данные.
