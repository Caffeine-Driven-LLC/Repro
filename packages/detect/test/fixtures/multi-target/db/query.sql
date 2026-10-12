SELECT a, b
FROM users u
JOIN orders o ON u.id = o.user_id
WHERE a = 1 UNION SELECT a, b FROM archive
