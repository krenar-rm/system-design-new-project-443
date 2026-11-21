-- Индекс под запрос истории пассажира: отбор по passenger_id, порядок по
-- created_at DESC. Состав и порядок полей повторяют запрос, поэтому индекс
-- закрывает и отбор, и сортировку, а LIMIT 20 превращается в ранний выход.
--
-- Обратный порядок полей не подошел бы: индекс с created_at впереди не дает
-- попасть в строки одного пассажира и просматривался бы целиком. Разбор
-- вариантов и цена решения в design/adr/010-history-index.md.
CREATE INDEX IF NOT EXISTS idx_trips_passenger_created_at
    ON trips (passenger_id, created_at DESC);
