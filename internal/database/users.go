package database

import (
	"context"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EnsureUserExists checks if a user exists by email, inserts them if not, and returns their UUID.
func EnsureUserExists(pool *pgxpool.Pool, email string) (uuid.UUID, error) {
	ctx := context.Background()
	var id uuid.UUID

	err := pool.QueryRow(ctx, `
		INSERT INTO users (email)
		VALUES ($1)
		ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
		RETURNING id
	`, email).Scan(&id)

	return id, err
}

// TrackJobApplication saves or updates a job status for a user
func TrackJobApplication(pool *pgxpool.Pool, email string, jobID uuid.UUID, status string) error {
	ctx := context.Background()

	userID, err := EnsureUserExists(pool, email)
	if err != nil {
		return err
	}

	// internal/database/users.go

	// Update the query inside TrackJobApplication to match your schema columns:
	_, err = pool.Exec(ctx, `
			INSERT INTO applications (job_id, user_id, status)
			VALUES ($1, $2, $3)
			ON CONFLICT (job_id, user_id)
			DO UPDATE SET status = EXCLUDED.status
	`, jobID, userID, status)

	return err
}

// Unuse/Remove a tracked job application row completely
func UnarchiveJobApplication(pool *pgxpool.Pool, email string, jobID uuid.UUID) error {
	ctx := context.Background()

	_, err := pool.Exec(ctx, `
		DELETE FROM applications
		WHERE job_id = $1
		  AND user_id = (SELECT id FROM users WHERE email = $2)
	`, jobID, email)

	return err
}
