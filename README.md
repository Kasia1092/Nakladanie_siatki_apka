# Siatka 1×1 m na rzucie

Mała statyczna aplikacja do nakładania siatki 1×1 m na wybrane pomieszczenia/korytarze na rzucie JPG/PNG.

## Funkcje

- wgrywanie obrazu rzutu JPG/PNG/WebP,
- kalibracja skali przez kliknięcie dwóch punktów znanego wymiaru,
- ręczne obrysowywanie pomieszczeń i korytarzy,
- generowanie szarej siatki 1×1 m tylko wewnątrz zaznaczonych obrysów,
- eksport gotowego obrazu do PNG,
- zapis i odczyt projektu JSON.

## Jak używać

1. Otwórz `index.html` w przeglądarce albo opublikuj repozytorium przez GitHub Pages.
2. Wgraj obraz rzutu.
3. Wejdź w tryb **Kalibruj**.
4. Kliknij dwa punkty o znanej odległości, wpisz wymiar w metrach i kliknij **Zastosuj kalibrację**.
5. Wejdź w tryb **Rysuj pomieszczenie**.
6. Klikaj narożniki pomieszczenia po wewnętrznej stronie ścian.
7. Kliknij **Zamknij obrys**.
8. Powtórz dla kolejnych pomieszczeń/korytarzy.
9. Kliknij **Eksportuj PNG**.

## Publikacja na GitHub Pages

1. Utwórz nowe repozytorium na GitHubie, np. `siatka-1m`.
2. Wgraj do niego pliki:
   - `index.html`
   - `style.css`
   - `app.js`
   - `README.md`
3. Wejdź w **Settings → Pages**.
4. Wybierz publikowanie z gałęzi `main` i folderu `/root`.
5. Po chwili strona będzie dostępna pod adresem podobnym do:
   `https://twoj-login.github.io/siatka-1m/`

## Uwagi

- Aplikacja jest w 100% statyczna: nie ma Pythona, backendu ani serwera.
- Obraz jest przetwarzany lokalnie w przeglądarce.
- Dla najlepszej dokładności używaj eksportu z PDF/DWG, a nie zrzutu ekranu.
