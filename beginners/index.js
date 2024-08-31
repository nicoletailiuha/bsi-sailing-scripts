const cheerio = require('cheerio');
const request = require('request');
const moment = require('moment');

const url = 'https://bsiseiling.no/calendar/list/?tribe-bar-date=2024-08-01';

function promiseRequest(url) {
    return new Promise(resolve => {
      request(url, function(err, response, html) {
        resolve(html);
      });
    });
  }

request(url, async (error, response, html) => {
    if (!error && response.statusCode == 200) {
        const $ = cheerio.load(html);

        const sailings = $('.tribe-events-calendar-list__event-details').toArray().map(sailing => {
            const sailingName = $(sailing).find('.tribe-events-calendar-list__event-title-link').text()

            const isPrivate = sailingName.toLowerCase().includes('private')

            const nameComponents = sailingName.replace(/\s/g,'').split('–')

            const data = {
                date: moment($(sailing).find('time').prop('datetime')),
                isCancelled: $(sailing).find('.tribe-events-status-label__text--canceled').text().toLowerCase().includes('cancelled') || sailingName.toLowerCase().includes('cancelled'),
                isPrivate,
                skipper: nameComponents[0],
                boat: nameComponents[1],
                type: nameComponents[2]?.toLowerCase().includes('beginner') ? 'beginner' : 'member',
                link: $(sailing).find('.tribe-events-calendar-list__event-title-link').prop('href'),
                attendees: []
            }

            return data
        })

        const beginnerSailings = sailings.filter(sailing => sailing.type === "beginner" && !sailing.isCancelled)
        const urls = beginnerSailings.map(s => s.link)

        const results = await Promise.all(urls.map(url => promiseRequest(url)))

        results.forEach((html, index) => {
            const $ = cheerio.load(html);

            const attendees = $('.rtec-attendee').toArray().map(a => $(a).text())
            beginnerSailings[index].attendees.push(...attendees)
        })

        const sailingsBeforeToday = beginnerSailings.filter(sailing => sailing.date.isBefore(moment()))
        const sailingsAfterToday = beginnerSailings.filter(sailing => sailing.date.isSame(moment()) || sailing.date.isAfter(moment()))

        const beginnersWithCompletedSailings = {}
        sailingsBeforeToday.forEach(sailing => {
            sailing.attendees.forEach(attendee => {
                if (!beginnersWithCompletedSailings[attendee]) {
                    beginnersWithCompletedSailings[attendee] = []
                }

                beginnersWithCompletedSailings[attendee].push(sailing)
            })
        })

        const beginnersWithPlannedSailings = {}
        sailingsAfterToday.forEach(sailing => {
            sailing.attendees.forEach(attendee => {
                if (!beginnersWithPlannedSailings[attendee]) {
                    beginnersWithPlannedSailings[attendee] = []
                }

                beginnersWithPlannedSailings[attendee].push(sailing)
            })
        })

        const beginners = []
        const beginnersWithTwoCompletedSailings = Object.keys(beginnersWithCompletedSailings)
            .filter(attendee => beginnersWithCompletedSailings[attendee].length >= 2)
        
        beginnersWithTwoCompletedSailings.forEach(name => {
            beginners.push({
                name,
                completed: beginnersWithCompletedSailings[name].length,
                datesCompleted: beginnersWithCompletedSailings[name].map(s => ({
                    date: s.date,
                    skipper: s.skipper
                }))
            })
        })

        const beginnersWithOneCompletedSailing = Object.keys(beginnersWithCompletedSailings)
            .filter(attendee => beginnersWithCompletedSailings[attendee].length === 1)
        
        beginnersWithOneCompletedSailing.forEach(name => {
            beginners.push({
                name,
                completed: 1,
                datesCompleted: beginnersWithCompletedSailings[name].map(s => ({
                    date: s.date,
                    skipper: s.skipper
                })),
                planned: beginnersWithPlannedSailings[name]?.length,
                datesPlanned: beginnersWithPlannedSailings[name]?.map(s => ({
                    date: s.date,
                    skipper: s.skipper
                })),
            })
        })

        const beginnersWithPlannedAndNoCompleted = Object.keys(beginnersWithPlannedSailings)
            .filter(attendee => beginnersWithPlannedSailings[attendee].length && !beginnersWithCompletedSailings[attendee]?.length)

        beginnersWithPlannedAndNoCompleted.forEach(name => {
            beginners.push({
                name,
                planned: beginnersWithPlannedSailings[name]?.length,
                datesPlanned: beginnersWithPlannedSailings[name].map(s => ({
                    date: s.date,
                    skipper: s.skipper
                })),
            })
        })

        beginners.sort((a, b) => a.name.localeCompare(b.name))
        

        beginners.forEach((beginner, index) => {
            const completed = beginner.completed ? `COMPLETED ${beginner.completed || 0} beginner sailings on ${beginner.datesCompleted.map(d => `${moment(d.date).format("DD-MM-YYYY")} with ${d.skipper}`).join(', ')}` : ''
            const planned = beginner.planned ? `has PLANNED ${beginner.planned || 0} beginner sailings  on ${beginner.datesPlanned.map(d => `${moment(d.date).format("DD-MM-YYYY")} with ${d.skipper}`).join(', ')}` : ''

            console.log(`${index + 1}. ${beginner.name} ${completed} ${completed && planned ? 'and' : ''} ${planned}`)
        })
    }
});