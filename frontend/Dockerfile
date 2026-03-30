# frontend/Dockerfile
FROM node:20-alpine

# Set the working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the frontend application code
COPY . .

# Build the Next.js application for production
RUN npm run build

# Expose the port Next.js runs on
EXPOSE 3000

# Command to start the Next.js production server
CMD ["npm", "run", "start"]