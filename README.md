# Bookroom × Obsidian

Локальная библиотека книг на Node.js + Obsidian. PDF, обложки, прогресс по странице, теги, папки, темы, RU/EN и отдельная вкладка достижений.

## Запуск
1. Скопируй `.env.example` → `.env`.
2. Укажи `OBSIDIAN_VAULT`.
3. Запусти `start.cmd`.
4. Открой `http://localhost:3050`.

Путь к Vault хранится только в `.env`; файл уже добавлен в `.gitignore`.

Obsidian-каталогизация и сеть связей создаются автоматически в `Bookroom/`; 