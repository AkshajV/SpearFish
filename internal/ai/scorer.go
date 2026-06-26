// internal/ai/scorer.go
package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/api/option"
)

type GeminiResponse struct {
	Score     int    `json:"score"`
	Reasoning string `json:"reasoning"`
}

// RunBatchScoring scores unscored jobs against a hardcoded candidate profile.
// Processes in batches of 10 to respect Gemini rate limits.
// Note: requires ai_score and ai_reasoning columns in the jobs table.
// Run this migration if they don't exist:
//
//	ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ai_score INTEGER DEFAULT -1;
//	ALTER TABLE jobs ADD COLUMN IF NOT EXISTS ai_reasoning TEXT DEFAULT '';
func RunBatchScoring(db *pgxpool.Pool, apiKey string) {
	ctx := context.Background()

	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Fatalf("Failed to create Gemini client: %v", err)
	}
	defer client.Close()

	model := client.GenerativeModel("gemini-2.5-flash")
	model.ResponseMIMEType = "application/json"

	// FIX: was querying company_name from jobs directly — that column doesn't exist.
	// Company name lives in the companies table and requires a JOIN.
	rows, err := db.Query(ctx, `
		SELECT j.id, j.job_title, c.name AS company_name, j.description
		FROM jobs j
		JOIN companies c ON j.company_id = c.id
		WHERE j.ai_score = -1 AND j.description != ''
		LIMIT 10
	`)
	if err != nil {
		log.Fatalf("DB Query failed: %v", err)
	}
	defer rows.Close()

	userProfile := `
		Candidate Profile:
		- Final-year Computer and Communication Engineering student (Cybersecurity minor).
		- Currently working as a technical intern at an MNC.
		- Actively studying for the CompTIA Security+ (SY0-701) certification.
		- Primary career target: Governance, Risk, and Compliance (GRC), seeking stable,
		  high-paying roles over heavily technical/operational security roles.
	`

	log.Println("Starting AI batch scoring...")

	for rows.Next() {
		var id, title, company, description string
		if err := rows.Scan(&id, &title, &company, &description); err != nil {
			continue
		}

		prompt := fmt.Sprintf(`
			You are an expert tech recruiter. Evaluate this job against the candidate's profile.
			Return ONLY a valid JSON object with two keys:
			- "score": an integer from 0 to 100 representing how good a match this is for the candidate.
			  Rate GRC/Audit/Compliance/Risk roles highly (80-100).
			  Rate general tech roles moderately (40-70).
			  Rate deeply technical roles lower (10-40).
			- "reasoning": A punchy, 1-sentence explanation of the score.

			%s

			Job Title: %s
			Company: %s
			Job Description: %s
		`, userProfile, title, company, description)

		resp, err := model.GenerateContent(ctx, genai.Text(prompt))
		if err != nil {
			log.Printf("Gemini API error for job %s: %v", id, err)
			continue
		}

		if len(resp.Candidates) == 0 || len(resp.Candidates[0].Content.Parts) == 0 {
			continue
		}

		rawJSON := fmt.Sprintf("%v", resp.Candidates[0].Content.Parts[0])
		rawJSON = strings.TrimPrefix(rawJSON, "```json\n")
		rawJSON = strings.TrimSuffix(rawJSON, "\n```")
		rawJSON = strings.TrimSpace(rawJSON)

		var result GeminiResponse
		if err := json.Unmarshal([]byte(rawJSON), &result); err != nil {
			log.Printf("Failed to parse JSON for job %s: %v\nRaw: %s", id, err, rawJSON)
			continue
		}

		_, err = db.Exec(ctx,
			`UPDATE jobs SET ai_score = $1, ai_reasoning = $2 WHERE id = $3`,
			result.Score, result.Reasoning, id,
		)
		if err == nil {
			log.Printf("✓ Scored %s @ %s: %d/100 — %s", title, company, result.Score, result.Reasoning)
		}
	}

	log.Println("Batch scoring complete.")
}
