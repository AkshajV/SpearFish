// cmd/api/main.go
package main

import (
	"flag"
	"log"
	"os"

	"github.com/AkshajV/SpearFish/internal/ai"
	"github.com/AkshajV/SpearFish/internal/api"
	"github.com/AkshajV/SpearFish/internal/database"
	"github.com/AkshajV/SpearFish/internal/scraper"
	"github.com/joho/godotenv"
)

func main() {
	// --mode scrape  → run the scraper once and exit
	// --mode serve   → start the HTTP API server (default)
	// --mode both    → scrape first, then start the server (useful for first run)
	mode := flag.String("mode", "serve", "Run mode: 'scrape', 'serve', 'both', or 'score'")
	flag.Parse()

	// Replace your old godotenv.Load() block with this:
	if err := godotenv.Load(); err != nil {
		// On production platforms like Render, a physical .env file won't exist.
		// We only fail if we're local and missing the file, OR if required variables are empty.
		if os.Getenv("DATABASE_URL") == "" {
			log.Printf("Warning: No .env file found and DATABASE_URL is empty: %v", err)
		} else {
			log.Println("No .env file found, but running with system environment variables.")
		}
	}

	pool, err := database.New()
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer pool.Close()

	if err := database.RunMigrations(pool); err != nil {
		log.Fatalf("Migrations failed: %v", err)
	}

	switch *mode {
	case "scrape":
		log.Println("Mode: scrape")
		// Run cleanup before scraping
		if err := database.CleanupOldJobs(pool); err != nil {
			log.Printf("Warning: Cleanup failed: %v", err)
		}
		scraper.RunFortune500Scrape(pool)
		log.Println("Scrape complete.")

	case "serve":
		log.Println("Mode: serve")
		api.StartServer(pool)

	case "both":
		log.Println("Mode: both — scraping first, then starting server")
		if err := database.CleanupOldJobs(pool); err != nil {
			log.Printf("Warning: Cleanup failed: %v", err)
		}
		scraper.RunFortune500Scrape(pool)
		log.Println("Scrape complete. Starting server...")
		api.StartServer(pool)

	case "score":
		log.Println("Mode: score")
		apiKey := os.Getenv("GEMINI_API_KEY")
		if apiKey == "" {
			log.Fatal("GEMINI_API_KEY is not set in your .env file")
		}
		ai.RunBatchScoring(pool, apiKey)
		log.Println("AI scoring complete.")

	default:
		log.Fatalf("Unknown mode %q. Use 'scrape', 'serve', 'both', or 'score'.", *mode)
	}

}
