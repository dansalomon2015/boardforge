UPDATE blueprint_revisions
SET spec = jsonb_set(
  spec,
  '{experienceId}',
  to_jsonb(
    CASE
      WHEN id = 'cinema_charades' OR id LIKE 'movie_mime_%' THEN 'movie_mime'
      WHEN id LIKE 'word_trap_%' THEN 'word_trap'
      WHEN id LIKE 'draw_battle_%' THEN 'draw_battle'
      WHEN id LIKE 'sound_check_%' THEN 'sound_check'
      WHEN id LIKE 'story_chain_%' THEN 'story_chain'
      WHEN id LIKE 'word_duel_%' THEN 'word_duel'
      WHEN id LIKE 'second_sense_%' THEN 'second_sense'
      ELSE 'generic'
    END
  )
)
WHERE spec->>'template' = 'composed'
  AND NOT spec ? 'experienceId';
