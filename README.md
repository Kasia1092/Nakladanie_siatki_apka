# Apka do nakładania siatki na JPG/PNG

Wersja naprawiona technicznie.

## Co poprawiono

- Prawy przycisk myszy jest blokowany na obrazie od razu, więc nie powinno wyskakiwać menu przeglądarki.
- Zamknięcie obszaru działa przez `mousedown` prawym przyciskiem, a nie dopiero przez menu kontekstowe.
- Zapis JSON działa przez zwykły link `data:application/json`, żeby był bardziej odporny na blokady przeglądarki.
- Dodano widoczny komunikat pod nagłówkiem: `Kod aktywny...`. Jeśli go nie widzisz, strona nadal ładuje stare pliki.
- Opcja `Auto: przecięcie linii na środku obszaru` jest w karcie każdego zamkniętego obszaru.

## Test po podmianie plików

Po wejściu na stronę pod nagłówkiem powinno być:

`Kod aktywny: prawy klik, JSON i przecięcie linii są włączone.`

Jeśli tego nie ma, GitHub Pages lub przeglądarka nadal pokazuje stare pliki.
