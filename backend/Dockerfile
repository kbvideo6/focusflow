FROM node:20-alpine

WORKDIR /app

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend/src ./src
COPY EES_2nd_Year_2nd_Semester_Timetable.csv ./EES_2nd_Year_2nd_Semester_Timetable.csv

EXPOSE 5000

CMD ["npm", "run", "start"]
