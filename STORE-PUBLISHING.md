# FILE-O Meet — Microsoft Store (Windows x64)

Версия: 0.6.1.0. Приложение Electron. Включена автоматическая сборка MSIX.

## 1. Исходники на GitHub

1. Создайте **Private** repository с названием `file-o-meet-desktop` на https://github.com/new
2. На Mac скачайте исходный ZIP, распакуйте и откройте Terminal в папке FILE-O-Meet-Source.
3. Выполните (замените USER на свой логин GitHub):

```bash
git init
git add .
git commit -m "Prepare FILE-O Meet MSIX for Microsoft Store"
git branch -M main
git remote add origin https://github.com/USER/file-o-meet-desktop.git
git push -u origin main
```

Если git push требует вход, авторизуйтесь через GitHub CLI или PAT (не пароль GitHub).

Проверьте, что в репозитории есть `.github/workflows/windows-msix.yml`.
Не загружайте `node_modules`, `dist`, `.env`, ключи и токены.

## 2. Сборка без Windows на Mac

В GitHub откройте Actions → FILE-O Meet Windows MSIX → Run workflow.
Дождитесь завершения; в разделе Artifacts скачайте `FILE-O-Meet-0.6.1.0-unsigned-MSIX`.
Внутри ZIP находится .msix для Microsoft Store. Этот пакет не предназначен для обычной установки без подписи.

## 3. Публикация

Откройте https://partner.microsoft.com/dashboard/apps-and-games/overview
Выберите FILE-O Meet → Start submission → Packages → загрузите MSIX.
Укажите бесплатное распространение, описание, возрастные ограничения,
скриншоты, поддержку и политику конфиденциальности.
Проверьте, что название, Publisher, Package identity совпадают с Product identity.

## 4. Что проверить до публичного выпуска

На реальной Windows 10/11 проверьте: системный звук, разрешения микрофона,
сворачивание в трей при записи, авторизацию одноразовым кодом, загрузку,
восстановление сессии при пропадании сети, отсутствие автозаписи,
удаление и обновление приложения.

Важное замечание: в текущих файлах описан тариф для доступа к записи встреч.
Если вы хотите назвать все функции бесплатными, сначала проверьте
реальные ограничения на сайте и согласуйте описание с ними.

Идентификаторы:
Package Name: MR.FIXDEV.FILE-OMEET
Publisher: CN=D27AA549-E324-46BF-AD21-D92FD054E9E8
PublisherDisplayName: MR.FIX DEV
Store ID: 9PCKGGS79WL9
