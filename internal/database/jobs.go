// internal/database/jobs.go
package database

import (
	"context"
	"fmt"
	"log"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SaveJob upserts a scraped job into the database.
// expMin and expMax should be -1 when experience is unknown.
func SaveJob(pool *pgxpool.Pool, title, company, location, description, jobURL, salary, source string, expMin, expMax int) error {
	ctx := context.Background()

	// Upsert the company (most will already exist after the first scrape)
	var companyID uuid.UUID
	err := pool.QueryRow(ctx,
		`INSERT INTO companies (name) VALUES ($1)
		 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`,
		company,
	).Scan(&companyID)
	if err != nil {
		return fmt.Errorf("failed to upsert company %q: %w", company, err)
	}

	level := experienceLevel(expMin, expMax)

	// ON CONFLICT DO UPDATE handles duplicates.
	// If the job_url already exists, it updates the mutable fields instead of duplicating.
	result, err := pool.Exec(ctx, `
		INSERT INTO jobs (
			job_title, company_id, location, description, job_url,
			salary, source, experience_min, experience_max, experience_level
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		ON CONFLICT (job_url) DO UPDATE SET
			description = EXCLUDED.description,
			experience_min = EXCLUDED.experience_min,
			experience_max = EXCLUDED.experience_max,
			experience_level = EXCLUDED.experience_level
	`, title, companyID, location, description, jobURL, salary, source, expMin, expMax, level)

	if err != nil {
		return fmt.Errorf("failed to insert/update job %q: %w", title, err)
	}

	if result.RowsAffected() == 0 {
		return nil
	}

	fmt.Printf("  ✓ Saved/Updated: %s @ %s\n", title, company)
	return nil
}

func experienceLevel(min, max int) string {
	if min < 0 || max < 0 {
		return "Unknown"
	}
	if max <= 1 {
		return "Fresher"
	}
	if min <= 3 {
		return "Junior"
	}
	if min <= 6 {
		return "Mid"
	}
	return "Senior"
}

func CleanupOldJobs(pool *pgxpool.Pool) error {
	ctx := context.Background()
	query := `DELETE FROM jobs WHERE created_at < NOW() - INTERVAL '30 days'`
	result, err := pool.Exec(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to execute cleanup query: %w", err)
	}
	log.Printf("Database Cleanup: Removed %d expired jobs.", result.RowsAffected())
	return nil
}

// TrackManualJob inserts a custom job and links it instantly to the user's vault
func TrackManualJob(pool *pgxpool.Pool, email, title, companyName, location, jobURL string) (uuid.UUID, error) {
	ctx := context.Background()

	// 1. Ensure the company exists
	var companyID uuid.UUID
	err := pool.QueryRow(ctx,
		`INSERT INTO companies (name) VALUES ($1)
		 ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
		 RETURNING id`, companyName,
	).Scan(&companyID)
	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to process manual company: %w", err)
	}

	// 2. Prevent unique constraint crashes if the user leaves the URL blank
	if jobURL == "" {
		jobURL = "manual-" + uuid.New().String()
	}

	// 3. Insert the Job
	var jobID uuid.UUID
	err = pool.QueryRow(ctx, `
		INSERT INTO jobs (
			job_title, company_id, location, description, job_url,
			salary, source, experience_min, experience_max, experience_level
		) VALUES ($1, $2, $3, 'Manually tracked application.', $4, 'Not Disclosed', 'Manual', -1, -1, 'Unknown')
		ON CONFLICT (job_url) DO UPDATE SET job_title = EXCLUDED.job_title
		RETURNING id
	`, title, companyID, location, jobURL).Scan(&jobID)

	if err != nil {
		return uuid.Nil, fmt.Errorf("failed to insert manual job: %w", err)
	}

	// 4. Link it to the user's tracked applications
	_, err = pool.Exec(ctx, `
		INSERT INTO applications (job_id, user_id, status)
		VALUES ($1, (SELECT id FROM users WHERE email = $2), 'Saved')
		ON CONFLICT (job_id, user_id) DO UPDATE SET status = EXCLUDED.status
	`, jobID, email)

	return jobID, err
}
