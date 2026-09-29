const COURSE_CODE_PATTERN = /(?:MAT|PHY|EES)\s+\d{4}\b/i;

export const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export function splitTimetableSubjects(value) {
  return value
    .split(/\s+(?:\/|&)\s+(?=(?:MAT|PHY|EES)\s+\d{4}\b)/i)
    .map(subject => subject.trim())
    .filter(Boolean);
}

export function parseTimetableCell(value) {
  return splitTimetableSubjects(value).map(rawSubject => {
    const locationMatch = rawSubject.match(/\s*\(@\s*([^()]+)\)\s*$/) || rawSubject.match(/\s*@\s*([^()]+)\s*$/);
    const location = locationMatch ? locationMatch[1].trim() : '';
    const subject = locationMatch
      ? rawSubject.slice(0, locationMatch.index).trim()
      : rawSubject.trim();

    return { subject, location };
  });
}

function toMinutes(value) {
  const match = value.match(/(\d{1,2})[.:](\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function mergeConsecutiveEntries(entries) {
  const merged = [];
  const orderedEntries = [...entries].sort((left, right) => {
    const dayOrder = DAYS.indexOf(left.day) - DAYS.indexOf(right.day);
    if (dayOrder !== 0) return dayOrder;
    const subjectOrder = left.subject.localeCompare(right.subject);
    if (subjectOrder !== 0) return subjectOrder;
    const locationOrder = left.location.localeCompare(right.location);
    if (locationOrder !== 0) return locationOrder;
    return (toMinutes(left.timeSlot) ?? 0) - (toMinutes(right.timeSlot) ?? 0);
  });

  for (const entry of orderedEntries) {
    const currentRange = entry.timeSlot.match(/(.+?)\s*-\s*(.+)/);
    const previous = merged[merged.length - 1];
    const previousRange = previous?.timeSlot.match(/(.+?)\s*-\s*(.+)/);

    const canMerge = previous && currentRange && previousRange &&
      previous.day === entry.day &&
      previous.subject === entry.subject &&
      previous.location === entry.location &&
      toMinutes(previousRange[2]) === toMinutes(currentRange[1]);

    if (canMerge) {
      previous.timeSlot = `${previousRange[1].trim()} - ${currentRange[2].trim()}`;
    } else {
      merged.push({ ...entry });
    }
  }

  return merged.sort((left, right) => {
    const dayOrder = DAYS.indexOf(left.day) - DAYS.indexOf(right.day);
    if (dayOrder !== 0) return dayOrder;
    return (toMinutes(left.timeSlot) ?? 0) - (toMinutes(right.timeSlot) ?? 0);
  });
}

export function parseTimetableCsv(csvText) {
  const lines = csvText
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const entries = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',').map(cell => cell.trim());
    const timeSlot = cells[0];
    if (!timeSlot || timeSlot.toUpperCase().includes('BREAK')) continue;

    DAYS.forEach((day, dayIndex) => {
      const value = cells[dayIndex + 1];
      if (!value || value.toUpperCase().includes('BREAK')) return;

      for (const { subject, location } of parseTimetableCell(value)) {
        if (COURSE_CODE_PATTERN.test(subject)) {
          entries.push({ day, timeSlot, subject, location });
        }
      }
    });
  }

  entries.sort((left, right) => {
    const dayOrder = DAYS.indexOf(left.day) - DAYS.indexOf(right.day);
    if (dayOrder !== 0) return dayOrder;
    const leftStart = toMinutes(left.timeSlot) ?? 0;
    const rightStart = toMinutes(right.timeSlot) ?? 0;
    return leftStart - rightStart;
  });

  return mergeConsecutiveEntries(entries);
}
