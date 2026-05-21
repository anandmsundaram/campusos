export interface CampusPlace {
  id: string
  name: string
  aliases: string[]
  formatted_address: string
  category: string
  lat: number
  lng: number
}

export interface CampusConfig {
  campus_name: string
  center_lat: number
  center_lng: number
  search_radius_meters: number
  places: CampusPlace[]
}

export const CAMPUS_CONFIG: CampusConfig = {
  campus_name: process.env.NEXT_PUBLIC_CAMPUS_NAME ?? 'Texas A&M University',
  center_lat: parseFloat(process.env.NEXT_PUBLIC_CAMPUS_LAT ?? '30.6180'),
  center_lng: parseFloat(process.env.NEXT_PUBLIC_CAMPUS_LNG ?? '-96.3365'),
  search_radius_meters: parseInt(process.env.NEXT_PUBLIC_CAMPUS_RADIUS_M ?? '8000', 10),
  places: [
    {
      id: 'hullabaloo-hall',
      name: 'Hullabaloo Hall',
      aliases: ['hullabaloo', 'hulla'],
      formatted_address: '255 Houston St, College Station, TX 77840',
      category: 'dorm',
      lat: 30.6223,
      lng: -96.3339,
    },
    {
      id: 'the-commons',
      name: 'The Commons',
      aliases: ['commons', 'commons dining'],
      formatted_address: '387 Bizzell St, College Station, TX 77843',
      category: 'dining',
      lat: 30.6192,
      lng: -96.3391,
    },
    {
      id: 'white-creek-apartments',
      name: 'White Creek Apartments',
      aliases: ['white creek', 'white creek apts'],
      formatted_address: '800 University Oaks Blvd, College Station, TX 77840',
      category: 'apartment',
      lat: 30.6087,
      lng: -96.3354,
    },
    {
      id: 'zachry-engineering',
      name: 'Zachry Engineering Center',
      aliases: ['zachry', 'zach'],
      formatted_address: '400 Bizzell St, College Station, TX 77843',
      category: 'academic',
      lat: 30.6214,
      lng: -96.3408,
    },
    {
      id: 'msc',
      name: 'Memorial Student Center',
      aliases: ['msc', 'student center', 'memorial student center'],
      formatted_address: '275 Joe Routt Blvd, College Station, TX 77843',
      category: 'student_center',
      lat: 30.6135,
      lng: -96.3411,
    },
    {
      id: 'sterling-evans-library',
      name: 'Sterling C. Evans Library',
      aliases: ['evans library', 'sterling library', 'library', 'sterling evans'],
      formatted_address: '400 Spence St, College Station, TX 77843',
      category: 'academic',
      lat: 30.6186,
      lng: -96.3389,
    },
    {
      id: 'northgate',
      name: 'Northgate',
      aliases: ['north gate', 'the gate'],
      formatted_address: 'Northgate District, College Station, TX 77840',
      category: 'district',
      lat: 30.6249,
      lng: -96.3415,
    },
    {
      id: 'easterwood-airport',
      name: 'Easterwood Airport',
      aliases: ['easterwood', 'cll', 'college station airport'],
      formatted_address: '1620 Easterwood Dr, College Station, TX 77840',
      category: 'transport',
      lat: 30.5958,
      lng: -96.3606,
    },
    {
      id: 'tamu-bus-depot',
      name: 'TAMU Bus Depot',
      aliases: ['bus depot', 'bus station', 'tamu transit'],
      formatted_address: 'TAMU Bus Depot, College Station, TX 77843',
      category: 'transport',
      lat: 30.6174,
      lng: -96.3421,
    },
  ],
}
