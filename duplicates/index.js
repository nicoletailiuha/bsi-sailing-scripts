const cheerio = require('cheerio');
const request = require('request');
const moment = require('moment');

const url = 'https://bsiseiling.no/calendar/list/';

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
                isCancelled: $(sailing).find('.tribe-events-status-label__text--canceled').text().toLowerCase().includes('cancelled'),
                isPrivate,
                skipper: nameComponents[0],
                boat: nameComponents[1],
                type: nameComponents[2]?.toLowerCase().includes('beginner') ? 'beginner' : 'member',
                link: $(sailing).find('.tribe-events-calendar-list__event-title-link').prop('href'),
                attendees: []
            }

            return data
        })

        const sailingsAfterToday = sailings.filter(sailing => sailing.date.isAfter(moment()))
        const urls = sailingsAfterToday.map(s => s.link)

        const results = await Promise.all(urls.map(url => promiseRequest(url)))

        results.forEach((html, index) => {
            const $ = cheerio.load(html);

            const attendees = $('.rtec-attendee').toArray().map(a => $(a).text())
            sailingsAfterToday[index].attendees.push(...attendees)
        })

        const attendeesWithSailings = {}

        sailingsAfterToday.forEach(sailing => {
            sailing.attendees.forEach(attendee => {
                if (!attendeesWithSailings[attendee]) {
                    attendeesWithSailings[attendee] = []
                }

                attendeesWithSailings[attendee].push(sailing)
            })
        })

        const attendeesWithDuplicates = Object.keys(attendeesWithSailings)
            .filter(attendee => attendeesWithSailings[attendee].length > 1)

        console.log('==== START DUPLICATE SEARCH ==== ')
        attendeesWithDuplicates.forEach(attendee => {
            const sailings = attendeesWithSailings[attendee]

            if (sailings.every(s => s.type === "beginner")) return

            console.log(`Attendee: ${attendee} has ${sailings.length} sailings:`)
            sailings.forEach(sailing => {
                console.log(`- ${sailing.date.format('DD/MM/YYYY')} - ${sailing.skipper} - ${sailing.boat} - ${sailing.type}`)
            })
            console.log('---------')
        })

        console.log('==== END DUPLICATE SEARCH ==== ')
    }
});