FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy the project
COPY . .

# Expose port used by Supabase locally
EXPOSE 54321

# Start Supabase (note: make sure Docker is running!)
CMD ["supabase", "start"]
