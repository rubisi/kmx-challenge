# KMX Coding Challenge

## Introduction
As part of our onboarding process, you are expected to build a backend service that manages electric vehicle trip data. The system should shift data between its service layer and a PostgreSQL database while exposing RESTful API endpoints. Main emphasis is placed on demonstrating your knowledge of RESTful API design, database modeling, and testing practices.

Fork this repository and create your own repository to get started.

**Time Allocation**: You have **1 week** to complete this challenge.

## Understanding the Data

The provided CSV file `./data/input.csv` contains electric vehicle trip records. Your first task is to analyse this data and identify the entities and relationships that should be modeled in your database schema.

## Tasks

For the following task, a skeleton implementation is provided. You need to complete the implementation by adding the necessary code to handle the task.

### Core Requirements
1. **Database Design**
   - Analyse the CSV file to identify possible entities and their relationships
   - Use Prisma ORM to design the database schema based on your analysis
   - Ensure proper normalization and foreign key relationships

2. **API Implementation**
   Implement the following endpoints for the **main entity** (which you need to identify):

   - **`GET /{main-entity}`**: Retrieve records with default pagination (10 items per page)
     - Support query parameters: `page`, `limit`
     - Return total count and pagination metadata

   - **`POST /{main-entity}`**: Create a new record from CSV data
     - Accept a single CSV row and parse it into multiple entities
     - Insert data into respective tables maintaining relationships

   - **`PUT /{main-entity}/:id`**: Update record data
     - Update the main entity
     - Optionally update related entities when they are directly modified

   - **`DELETE /{main-entity}/:id`**: Delete a record
     - Remove the main entity record and clean up orphaned related entities
     - Do not delete shared entities that may be referenced by other records

3. **Additional Endpoints**
   - **`GET /result`**: Provide record counts per entity type
   - **`POST /import`**: Bulk import endpoint for processing the entire CSV file

4. **Data Import Utility**
   - Create a standalone importer that uses the `POST /{main-entity}` endpoint
   - Process the CSV file row by row with proper error handling

### Testing Requirements
Write comprehensive tests using Testcontainers:

1. **CRUD Tests**: Four tests covering all main entity endpoints (GET, POST, PUT, DELETE)
2. **Import Test**: Test loading the complete CSV file into the database

### Optional Enhancement
- **`POST /export`**: Generate CSV file based on query parameters for specific tables

## Technical Requirements

### Tech Stack
- **Runtime**: Node.js with TypeScript
- **Framework**: Express.js
- **Database**: PostgreSQL with Prisma ORM
- **Testing**: Vitest with Testcontainers
- **Package Manager**: pnpm

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- pnpm package manager
- Docker (for PostgreSQL and tests)

### Setup Instructions

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Database Setup**
   ```bash
   # Start PostgreSQL with Docker
   docker run --name kmx-postgres -e POSTGRES_PASSWORD=password -e POSTGRES_DB=kmx_challenge -p 5432:5432 -d postgres:15

   # Generate Prisma client
   pnpm prisma:generate

   # Run database migrations
   pnpm prisma:push
   ```

3. **Environment Configuration**
   Create a `.env` file in the project root with:
   ```
   DATABASE_URL="postgresql://postgres:password@localhost:5432/kmx_challenge"
   PORT=3000
   ```

### Available Commands
```bash
# Install dependencies from package.json
pnpm install

# Start the server
pnpm start:server

# Run the importer
pnpm start:import

# Run tests
pnpm test

# Run linter
pnpm lint

# Fix linting issues
pnpm lint:fix

# Introspect your database in browser
pnpm prisma:studio

# Start PostgreSQL container (provided you ran that container already)
docker start kmx-postgres

# Stop PostgreSQL container
docker stop kmx-postgres

# Remove PostgreSQL container (if you need to start fresh)
docker rm kmx-postgres
```

## Submission Guidelines
1. **Code Repository**
   - Ensure all code is committed and pushed
   - Include a clear commit history
   - Remove any sensitive information

2. **Documentation**
   - Update this README with any additional setup steps
   - Document any assumptions or design decisions
   - Include API documentation or examples

3. **Database Schema**
   - Include your final Prisma schema
   - Ensure migrations are included

4. **Testing**
   - All tests should pass

## Documentation & Resources

Here are helpful links to the key technologies used in this challenge:

### Core Technologies
- **[Node.js](https://nodejs.org/en/docs/)** - JavaScript runtime environment
- **[TypeScript](https://www.typescriptlang.org/docs/)** - Typed JavaScript at scale
- **[Express.js](https://expressjs.com/)** - Fast, unopinionated web framework for Node.js

### Database & ORM
- **[PostgreSQL](https://www.postgresql.org/docs/)** - Advanced open source relational database
- **[Prisma](https://www.prisma.io/docs)** - Next-generation TypeScript ORM
  - [Schema Reference](https://www.prisma.io/docs/reference/api-reference/prisma-schema-reference)
  - [Client API](https://www.prisma.io/docs/reference/api-reference/prisma-client-reference)

### Testing
- **[Vitest](https://vitest.dev/)** - Fast unit test framework powered by Vite
- **[Testcontainers](https://testcontainers.com/)** - Integration testing with real dependencies
  - [Node.js Guide](https://node.testcontainers.org/)

### Package Management
- **[pnpm](https://pnpm.io/)** - Fast, disk space efficient package manager
  - [CLI Commands](https://pnpm.io/cli/add)

### Additional Libraries
- **[Papa Parse](https://www.papaparse.com/)** - Powerful CSV parser for JavaScript

## Questions?

If you encounter any blockers or have questions about requirements, please don't hesitate to reach out. We're here to help you succeed!

Good luck! 🚀
