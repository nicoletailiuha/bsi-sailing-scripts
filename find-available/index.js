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

            const link = $(sailing).find('.tribe-events-calendar-list__event-title-link').prop('href')

            const crewInfo = $(sailing).find('.rtec-attendance-display')?.text().replace('Crew:', '').replace(/ /g, '').split('/')

            const data = {
                date: moment($(sailing).find('time').prop('datetime')),
                isCancelled: $(sailing).find('.tribe-events-status-label__text--canceled').text().toLowerCase().includes('cancelled'),
                isPrivate,
                skipper: nameComponents[0],
                boat: nameComponents[1],
                type: nameComponents[2]?.toLowerCase().includes('beginner') ? 'beginner' : 'member',
                link,
                nrTotal: crewInfo?.[1],
                nrRegistered: crewInfo?.[0],
                attendees: []
            }

            return data
        })

        const memberSailingsWithAvailableSpots = sailings.filter(s => 
            s.type === 'member' 
            && !s.isPrivate 
            && !s.isCancelled
            && !!s.nrTotal 
            && (s.nrRegistered < s.nrTotal)
        )
        const urls = memberSailingsWithAvailableSpots.map(s => s.link)

        const results = await Promise.all(urls.map(url => promiseRequest(url)))

        results.forEach((html, index) => {
            const $ = cheerio.load(html);

            const attendees = $('.rtec-attendee').toArray().map(a => $(a).text())
            memberSailingsWithAvailableSpots[index].attendees.push(...attendees)
        })
        
        if (memberSailingsWithAvailableSpots.length) {
            console.log('====== AVAILABLE SAILINGS FOR JOINING ======')
            memberSailingsWithAvailableSpots.forEach((sailing, index) => {
                console.log(`${index + 1}. Sailing on ${sailing.boat} with ${sailing.skipper}, ${sailing.date.format('DD/MM/YYYY')} ${sailing.link}`)
                console.log(`Already registered: ${sailing.attendees.join(', ')}`)
            })
        } else {
            console.log("No available sailings")
        }
    }
});