require 'sinatra/base'
require 'sinatra/reloader'
require 'redis'

require 'execjs'
require 'uglifier'
require 'sassc'
require 'sprockets'

Redis.current = Redis.new(url: ENV['REDIS_URL'])
PUBLIC_FILES ||= Dir.glob('**/*', base: 'public').map { |file| "/#{file}" }
Rack::Mime::MIME_TYPES.merge!('.webmanifest' => 'application/manifest+json')

class Notepad < Sinatra::Base

	class EnforceHttps
		def initialize(app, options = {})
			@app, @options = app, options
		end

		def call(env)
			request = Rack::Request.new(env)
			if @options[:enabled] && request.scheme == 'http'
				[302, {'Location' => request.url.sub('http', 'https')}, []]
			else
				@app.call(env)
			end
		end
	end

	configure do
		enable :logging
		enable :sessions
		set :protection, except: [:session_hijacking]
		set :sessions, { max_age: 60 * 60 * 24 * 365, secure: production? }
		set :session_secret, ENV['SESSION_SECRET']
		set :sprockets, Sprockets::Environment.new

		sprockets.append_path('assets')
		sprockets.js_compressor  = Uglifier.new(harmony: true, output: {beautify: development?})
		sprockets.css_compressor = :sassc
	end

	configure :development do
		register Sinatra::Reloader
	end

	helpers do
		def meta(key, value = nil)
			@meta ||= {}
			@meta[key] = value unless value.nil?
			@meta[key]
		end
	end

	def authenticated?
		session[:user_id]
	end

	use EnforceHttps, enabled: production?

	before do
		redirect('/login') unless authenticated? || %w(/login /app.css /app.js).include?(request.path) || PUBLIC_FILES.include?(request.path)
	end

	get '/app.*' do
		settings.sprockets.call(env)
	end

	get '/' do
		erb :index
	end

	get '/login' do
		authenticated? ? redirect('/') : erb(:login)
	end

	post '/login' do
		if params['username'] == ENV['APP_USERNAME'] && Rack::Utils.secure_compare(params['password'], ENV['APP_PASSWORD'])
			session[:user_id] = 1
			redirect('/')
		else
			redirect('/login')
		end
	end

	delete '/api/logout.json' do
		content_type :json
		session.delete(:user_id)
		{ok: true}.to_json
	end

	get '/api/ping.json' do
		content_type :json
		{time: Time.now.utc}.to_json
	end

	get '/api/notes/:id.json' do
		content_type :json
		Redis.current.get("users:#{session[:user_id]}:notes:#{params['id']}") || not_found
	end

	put '/api/notes/:id.json' do
		content_type :json
		note = request.body.read.sub('[UPDATED_AT]', updated_at = Time.now.utc.iso8601)
		Redis.current.set("users:#{session[:user_id]}:notes:#{params['id']}", note)
		Redis.current.save if settings.development?
		{ok: true, metadata: {updated_at: updated_at}}.to_json
	end

end
